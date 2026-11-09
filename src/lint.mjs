// Compass health check: rot detection for the orientation store.
//
// Memory rots in predictable ways, and every one of them is silent: a note points at a file that was
// renamed, a note grows into a second copy of the source it was meant to point at, a `verified:` date
// drifts a season past the code it describes, a generated rule file is hand-edited and stops matching
// the others. None of that fails a build or shows up in review.
//
// ERRORS are provably wrong right now and fail the run. WARNINGS are judgement calls for a human.
//
// Path rules, one per kind of reference, all independent of the working directory:
//   [text](link)        — relative to the note, as Markdown renders it
//   `backticked/path`   — from the project root
//   sources: [a, b]     — from the project root
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { check as checkDrift } from './sync.mjs'

export const TYPES = ['map', 'state', 'trap', 'capsule', 'session']
export const STATUSES = ['current', 'needs-check', 'superseded', 'draft']
export const ORIGINS = ['human', 'ai-derived']

// Directories the lint does not treat as notes: archive/ is out of circulation and supposed to be
// stale; protocol/ is generated and checked for drift instead.
const SKIP_DIRS = new Set(['archive', 'protocol'])

// A sentence break: terminal punctuation, whitespace, then something that starts a new sentence.
// Deliberately NOT a bare /\./ — `router.tsx`, `src/app/` and `v1.5` carry dots that end nothing.
const SENTENCE_BREAK = /[.!?]\s+["'([]?[A-Z]/

// A backticked token is checked as a path only when it plainly is one: no spaces, no scheme, no
// placeholder, at least one slash, and a file extension or a trailing slash. `text/plain`,
// `owner/repo`, `/de` and `<lang>.ts` are all left alone.
const PATHLIKE = /^(?!\.\.?\/)[\w.@[\]=+()-]+(?:\/[\w.@[\]=+()-]*)+$/
const looksLikePath = (t) => PATHLIKE.test(t) && (t.endsWith('/') || /\.[A-Za-z0-9]{1,8}$/.test(t))

const posix = (p) => p.replace(/\\/g, '/')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...walk(p))
    } else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

/** Minimal YAML front-matter reader — flat scalars and [a, b] lists only, which is all a note uses. */
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return null
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    out[key] =
      raw.startsWith('[') && raw.endsWith(']')
        ? raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
        : raw.trim()
  }
  out.__length = m[0].split(/\r?\n/).length - 1
  return out
}

/** The text with fenced code blocks blanked out (line count preserved), so examples are not linted. */
export function withoutFences(text) {
  let inFence = false
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return ''
      }
      return inFence ? '' : line
    })
    .join('\n')
}

/** GitHub's heading anchor: lowercase, punctuation dropped, each space a hyphen. */
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
}

function anchorsOf(file, slugCache) {
  if (slugCache.has(file)) return slugCache.get(file)
  const seen = new Map()
  const anchors = new Set()
  for (const line of withoutFences(readFileSync(file, 'utf8')).split('\n')) {
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)
    if (!h) continue
    const base = slug(h[1])
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    anchors.add(n ? `${base}-${n}` : base)
  }
  slugCache.set(file, anchors)
  return anchors
}

/** Local calendar days between an ISO date and today. Negative means the date is in the future. */
function daysSince(iso, today) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000)
}

function lastCommitDate(root, rel) {
  try {
    return (
      execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    )
  } catch {
    return null
  }
}

function abstractProblem(raw, cap) {
  if (raw === undefined) return "front matter missing 'abstract' — a capsule must say what it is for"
  if (Array.isArray(raw)) return "abstract must not begin with '[' — the front-matter reader takes that for a list"
  const a = String(raw).trim()
  if (!a) return 'abstract is empty'
  if (a.length > cap) return `abstract is ${a.length} characters, cap is ${cap} — it routes, it does not summarise`
  if (SENTENCE_BREAK.test(a)) return 'abstract spans more than one sentence — one sentence, or it is a summary an agent has to weigh'
  return null
}

/**
 * Lints the store at `root` under `config`. Returns { errors, warnings, notes }.
 * `today` is injectable for tests.
 */
export function lint(root, config, { today = new Date(), git = true } = {}) {
  const errors = []
  const warnings = []
  const caps = config.caps
  const storeDir = join(root, config.store)
  const rel = (abs) => posix(relative(root, abs))

  if (!existsSync(storeDir)) {
    return { errors: [`no ${config.store}/ — run \`compass init\``], warnings, notes: 0 }
  }

  const files = walk(storeDir)
  const linkedFromMap = new Map() // capsule path (from the store) -> the abstract MAP.md claims for it
  const capsuleAbstracts = new Map()
  const ignored = (p) => config.ignorePaths.some((prefix) => p.startsWith(prefix))
  const commitDates = new Map()
  const slugCache = new Map() // per run: a long-lived process must not see yesterday's headings
  const commitDate = (p) => {
    if (!commitDates.has(p)) commitDates.set(p, git ? lastCommitDate(root, p) : null)
    return commitDates.get(p)
  }

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const name = rel(file)
    const fm = frontmatter(text)
    const fromStore = posix(relative(storeDir, file))
    const isMap = fromStore === 'MAP.md'
    const isCapsule = fromStore.startsWith('capsules/')

    // ---- 1. every note declares what it is, where it came from, and when it was last checked ----
    if (!fm) {
      errors.push(`${name}: no YAML front matter`)
      continue
    }
    for (const key of ['type', 'status', 'origin', 'verified']) {
      if (!fm[key]) errors.push(`${name}: front matter missing '${key}'`)
    }
    // A typo here is not cosmetic: `type: capsul` would silently skip every capsule check below.
    if (fm.type && !TYPES.includes(fm.type)) errors.push(`${name}: type must be one of ${TYPES.join(', ')} (got '${fm.type}')`)
    if (fm.status && !STATUSES.includes(fm.status)) errors.push(`${name}: status must be one of ${STATUSES.join(', ')} (got '${fm.status}')`)
    if (fm.origin && !ORIGINS.includes(fm.origin)) errors.push(`${name}: origin must be one of ${ORIGINS.join(', ')} (got '${fm.origin}')`)
    const validDate = fm.verified && /^\d{4}-\d{2}-\d{2}$/.test(fm.verified) && !Number.isNaN(Date.parse(fm.verified))
    if (fm.verified && !validDate) errors.push(`${name}: verified must be a YYYY-MM-DD date (got '${fm.verified}')`)
    if (isCapsule && fm.type !== 'capsule') errors.push(`${name}: a file in capsules/ must have type: capsule`)

    const body = text.split(/\r?\n/).slice(fm.__length ?? 0)
    const prose = withoutFences(text)

    // ---- 2. density, and the abstract that decides whether a capsule is opened at all ----
    if (fm.type === 'capsule') {
      const problem = abstractProblem(fm.abstract, caps.abstractChars)
      if (problem) errors.push(`${name}: ${problem}`)
      else capsuleAbstracts.set(fromStore, String(fm.abstract).trim())
      const lines = body.filter((l) => l.trim() !== '').length
      if (lines > caps.capsuleLines) {
        errors.push(`${name}: ${lines} lines of content, cap is ${caps.capsuleLines}. Cut, or split — a capsule points at source, it does not reproduce it.`)
      }
    }
    const capChars = caps.fileChars?.[fromStore]
    if (capChars && text.length > capChars) {
      warnings.push(`${name}: ${text.length} characters, cap is ${capChars} — this file is read whole; move detail into a capsule or trim what is done`)
    }

    // ---- 3. links: dead files and dead anchors ----
    for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      const [path, anchor] = target.split('#')
      const dest = path ? resolve(dirname(file), decodeURI(path)) : file
      if (path && !existsSync(dest)) {
        errors.push(`${name}: link to '${target}' does not exist`)
        continue
      }
      if (anchor && dest.endsWith('.md') && statSync(dest).isFile() && !anchorsOf(dest, slugCache).has(anchor)) {
        errors.push(`${name}: link to '${target}' — no heading in ${rel(dest)} has the anchor #${anchor}`)
      }
    }

    // ---- 4. backticked paths, from the project root: the pointers an agent actually opens ----
    for (const [, token] of prose.matchAll(/`([^`\n]+)`/g)) {
      const t = token.trim()
      if (!looksLikePath(t) || ignored(t)) continue
      // From the root is the rule; a name inside the store (`capsules/`, `archive/`) is also fine.
      if (![root, storeDir, dirname(file)].some((base) => existsSync(join(base, t)))) {
        const msg = `${name}: \`${t}\` does not exist — backticked paths are read from the project root, so write them in full`
        // In MAP.md and capsules it is a routing pointer, so it is wrong; elsewhere it may be prose.
        ;(isMap || isCapsule ? errors : warnings).push(msg)
      }
    }

    // ---- 5. sources: concrete paths must exist, and must not have changed since the note was checked ----
    for (const src of Array.isArray(fm.sources) ? fm.sources : []) {
      if (/[*?]/.test(src) || !src.includes('/') || /\s/.test(src)) continue
      const abs = join(root, src)
      if (!existsSync(abs)) {
        errors.push(`${name}: source '${src}' does not exist`)
        continue
      }
      if (validDate && statSync(abs).isFile()) {
        const changed = commitDate(src)
        if (changed && changed > fm.verified) {
          warnings.push(`${name}: source '${src}' changed on ${changed}, after this note was verified (${fm.verified}) — re-check it`)
        }
      }
    }

    // ---- 6. staleness by date ----
    if (validDate) {
      const age = daysSince(fm.verified, today)
      if (age < 0) errors.push(`${name}: verified ${fm.verified} is in the future`)
      if (['capsule', 'state', 'trap'].includes(fm.type) && age > caps.staleDays && fm.status === 'current') {
        warnings.push(`${name}: verified ${age} days ago — re-check against the code, or set status: needs-check`)
      }
      if (fm.type === 'session' && age > caps.promoteDays) {
        warnings.push(`${name}: ${age} days old — promote what is durable, then move it to archive/`)
      }
    }

    if (isMap) {
      // MAP.md carries a verbatim copy of each capsule's abstract so the map alone can route.
      for (const m of prose.matchAll(/\]\((capsules\/[^)]+)\)([^|\n]*)/g)) {
        linkedFromMap.set(m[1], m[2].replace(/^\s*—\s*/, '').trim())
      }
      for (const line of prose.split('\n')) {
        if (!line.startsWith('|') || /^\|[\s|:-]+\|?$/.test(line)) continue
        if (line.length > caps.mapRowChars) {
          warnings.push(`${name}: row "${line.slice(2, 60).trim()}…" is ${line.length} characters, cap is ${caps.mapRowChars} — the detail belongs in a capsule`)
        }
      }
    }
  }

  // ---- 7. MAP.md's copy of an abstract must match the capsule's own, character for character ----
  for (const [target, mapCopy] of linkedFromMap) {
    const own = capsuleAbstracts.get(target)
    if (own === undefined) continue
    if (!mapCopy) errors.push(`${config.store}/MAP.md: routes to '${target}' without its abstract — the row cannot be judged from the map`)
    else if (mapCopy !== own) {
      errors.push(`${config.store}/MAP.md: abstract for '${target}' does not match the capsule's own\n          map:     ${mapCopy}\n          capsule: ${own}`)
    }
  }

  // ---- 8. traps.md indexes itself, exactly ----
  // The index is read whole and the entries are not, so an entry the index does not list is one
  // nobody will ever be routed to. Matching is exact — a substring match let "Foo" pass for "Foo bar".
  const trapsFile = join(storeDir, 'traps.md')
  if (existsSync(trapsFile)) {
    const text = withoutFences(readFileSync(trapsFile, 'utf8'))
    const name = rel(trapsFile)
    const start = text.indexOf('## Index')
    const rest = start >= 0 ? text.slice(start) : ''
    const end = rest.search(/^---$/m)
    const index = end > 0 ? rest.slice(0, end) : ''
    const listed = new Map()
    for (const [, label, anchor] of index.matchAll(/^\s*[-*]\s+\[(.+?)\]\(#([^)\s]+)\)/gm)) listed.set(label.trim(), anchor)
    const headings = [...text.matchAll(/^### (.+?)\s*$/gm)].map((m) => m[1].trim())
    if (headings.length && !index) errors.push(`${name}: no '## Index' section closed by a '---' line`)
    else {
      for (const h of headings) {
        if (!listed.has(h)) errors.push(`${name}: '${h}' is not in the index — nobody will be routed to it`)
        else if (listed.get(h) !== slug(h)) errors.push(`${name}: the index links '${h}' to #${listed.get(h)}, its anchor is #${slug(h)}`)
      }
      for (const label of listed.keys()) {
        if (!headings.includes(label)) errors.push(`${name}: the index lists '${label}', but no entry has that heading`)
      }
      if (index.length > caps.trapsIndexChars) {
        warnings.push(`${name}: the index is ${index.length} characters, cap is ${caps.trapsIndexChars} — archive traps a test now prevents`)
      }
    }
  }

  // ---- 9. orphans: a capsule the map never routes to will never be read ----
  for (const file of files) {
    const fromStore = posix(relative(storeDir, file))
    if (fromStore.startsWith('capsules/') && !linkedFromMap.has(fromStore)) {
      warnings.push(`${rel(file)}: not routed to from MAP.md — no agent will ever load it`)
    }
  }

  // ---- 10. generated files: one config, every tool, no hand edits ----
  for (const { path, problem } of checkDrift(root, config)) {
    errors.push(`${path}: ${problem} — run \`compass sync\`, or change compass.config.json instead`)
  }

  return { errors, warnings, notes: files.length }
}

