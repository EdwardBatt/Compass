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
import { join, dirname, resolve, relative, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { check as checkDrift } from './sync.mjs'
import { hints } from './discover.mjs'

// log: an append-only record nobody reads whole (trajectories.md, team mode); never ages, never routed.
export const TYPES = ['map', 'state', 'trap', 'capsule', 'session', 'log']
export const STATUSES = ['current', 'needs-check', 'superseded', 'draft']
export const ORIGINS = ['human', 'ai-derived']
// What a state item (team mode, state/<item>.md) can say. `absent`: described somewhere, not built.
export const STATES = ['working', 'partial', 'absent', 'broken', 'waiting']
// `human:<name>` says which person asserted it — on a team, whom to ask before superseding it.
const validOrigin = (o) => ORIGINS.includes(o) || /^human:\s*\S/.test(o)

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

/**
 * Minimal YAML front-matter reader — flat scalars, and lists written either as [a, b] or as
 * `- item` lines under an empty key, which is all a note uses.
 */
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return null
  const out = {}
  const dupes = []
  let listKey = null
  const listKeys = new Set()
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s+(.*?)\s*$/)
    if (item && listKey) {
      out[listKey].push(item[1])
      continue
    }
    listKey = null
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    if (key in out) dupes.push(key)
    if (raw.trim() === '') {
      // Either an empty value or the start of a `- item` list; an empty list reads as empty.
      out[key] = []
      listKey = key
      listKeys.add(key)
      continue
    }
    out[key] =
      raw.startsWith('[') && raw.endsWith(']')
        ? raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
        : raw.trim()
  }
  // A key with no value and no `- item` lines under it is an empty value, as before.
  for (const [k, v] of Object.entries(out)) if (Array.isArray(v) && !v.length && listKeys.has(k)) out[k] = ''
  out.__length = m[0].split(/\r?\n/).length - 1
  out.__dupes = dupes
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
export function daysSince(iso, today) {
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

/**
 * The files this branch changed since it left `base`, from the project root: committed, staged,
 * unstaged and untracked. Throws with git's message when `base` is not a ref.
 */
export function changedSince(root, base) {
  const g = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let mergeBase
  try {
    mergeBase = g('merge-base', base, 'HEAD').trim()
  } catch (e) {
    throw new Error(`cannot compare with '${base}': ${String(e.stderr || e.message).trim().split('\n')[0]} — in CI, check out with fetch-depth: 0`)
  }
  // --relative: paths from the project root, even when it sits below the repository's top level.
  const lines = [...g('diff', '--name-only', '--relative', mergeBase).split('\n'), ...g('ls-files', '--others', '--exclude-standard').split('\n')]
  return new Set(lines.map((s) => s.trim()).filter(Boolean))
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
 * Lints the store at `root` under `config`. Returns { errors, warnings, notes, changed }.
 * `today` is injectable for tests.
 *
 * With `base` (a git ref), the run is scoped to this branch: errors are still reported everywhere,
 * because a change anywhere can break a note nobody touched (a deleted file a capsule points at),
 * but warnings are kept only for files the branch changed, so a pull request is not buried under
 * the whole project's ageing notes. It adds one check: a note whose described files the branch
 * changed, while leaving the note alone.
 */
export function lint(root, config, { today = new Date(), git = true, base = null } = {}) {
  const errors = []
  const warnings = []
  const caps = config.caps
  const storeDir = join(root, config.store)
  const rel = (abs) => posix(relative(root, abs))

  if (!existsSync(storeDir)) {
    return { errors: [`no ${config.store}/ — run \`compass init\``], warnings, notes: 0 }
  }

  const files = walk(storeDir)
  const changed = base ? changedSince(root, base) : null
  const describes = new Map() // note -> the project files it says something about
  const owners = new Map() // note -> who answers for it
  const linkedFromMap = new Map() // capsule path (from the store) -> the abstract MAP.md claims for it
  const capsuleAbstracts = new Map()
  const ignored = (p) => config.ignorePaths.some((prefix) => p.startsWith(prefix))
  const commitDates = new Map()
  const slugCache = new Map() // per run: a long-lived process must not see yesterday's headings
  const planTracked = [['plan', config.paths.plan], ['roadmap', config.paths.roadmap]]
    .filter(([, p]) => typeof p === 'string' && p)
    .map(([label, p]) => [label, p.replace(/\/$/, '')])
  const planPaths = planTracked.map(([, p]) => p)
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
    const isState = fromStore === 'STATE.md'

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
    if (fm.origin && !validOrigin(fm.origin)) errors.push(`${name}: origin must be one of ${ORIGINS.join(', ')}, or human:<name> (got '${fm.origin}')`)
    // Two `verified:` lines is what a union merge, or a careless conflict resolution, leaves behind.
    // The reader takes the last one silently, so it is an error, not a guess.
    for (const key of new Set(fm.__dupes)) {
      errors.push(`${name}: front matter has '${key}' more than once — likely left by a merge; keep one (for verified, the later date)`)
    }
    if (config.team && fm.type === 'session') {
      if (!fm.author) errors.push(`${name}: a session note needs 'author:' in team mode — start uses it to tell one person's work from another's`)
      if (/^\d{4}-\d{2}-\d{2}\.md$/.test(basename(file))) {
        warnings.push(`${name}: named by date alone — in team mode, name it YYYY-MM-DD-<who>-<topic>.md so two people on the same day never collide`)
      }
    }
    const validDate = fm.verified && /^\d{4}-\d{2}-\d{2}$/.test(fm.verified) && !Number.isNaN(Date.parse(fm.verified))
    if (fm.verified && !validDate) errors.push(`${name}: verified must be a YYYY-MM-DD date (got '${fm.verified}')`)
    if (isCapsule && fm.type !== 'capsule') errors.push(`${name}: a file in capsules/ must have type: capsule`)
    if (fm.owners !== undefined && fm.owners !== '') {
      const list = Array.isArray(fm.owners) ? fm.owners : [fm.owners]
      if (list.length) owners.set(name, list)
    }
    const described = new Set()
    if (fm.type !== 'session') describes.set(name, described)

    const body = text.split(/\r?\n/).slice(fm.__length ?? 0)
    // A log entry is history: a path it names may since have been deleted, rightly. Its entries are
    // not checked; its header is.
    const prose = fm.type === 'log' ? withoutFences(text).replace(/^\s*[-*]?\s*trajectory:.*$/gm, '') : withoutFences(text)

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
    if (fm.type === 'log' && text.length > caps.logChars) {
      // Nobody reads a log whole, so this is housekeeping, not cost: past the cap, archive it.
      warnings.push(`${name}: ${text.length} characters, cap is ${caps.logChars} — move it to archive/ under a dated name (compass report still reads it there) and start a new one with the same header`)
    } else if (capChars && text.length > capChars) {
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
      if (![root, storeDir, dirname(file)].some((dir) => existsSync(join(dir, t)))) {
        const msg = `${name}: \`${t}\` does not exist — backticked paths are read from the project root, so write them in full`
        // In MAP.md and capsules it is a routing pointer, so it is wrong; elsewhere it may be prose.
        ;(isMap || isCapsule ? errors : warnings).push(msg)
      } else if (isCapsule && existsSync(join(root, t))) described.add(t)
    }

    // ---- 5. sources: concrete paths must exist, and must not have changed since the note was checked ----
    for (const src of Array.isArray(fm.sources) ? fm.sources : []) {
      if (/[*?]/.test(src) || !src.includes('/') || /\s/.test(src)) continue
      const abs = join(root, src)
      if (!existsSync(abs)) {
        errors.push(`${name}: source '${src}' does not exist`)
        continue
      }
      described.add(src)
      // Session notes are snapshots of one day: a later change to their sources says nothing about
      // them, and the promote-or-archive warning already covers their age. STATE's link to the
      // configured plan and roadmap is checked once, in section 7, whether or not it is listed here.
      const tracked = isState && planPaths.includes(src.replace(/\/$/, ''))
      if (validDate && fm.type !== 'session' && !tracked && statSync(abs).isFile()) {
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

    // ---- 7. STATE against the plan the config names — no note has to remember to list it ----
    // A plan that moved after STATE was last checked is the drift Compass exists to catch: the plan
    // says built, STATE says not, and the next start proposes work that is already done.
    if (isState && validDate) {
      for (const [label, p] of planTracked) {
        const changed = commitDate(p)
        if (changed && changed > fm.verified) {
          warnings.push(`${name}: the ${label} (\`${p}\`) changed on ${changed}, after STATE was verified (${fm.verified}) — check STATE still agrees with it, then set verified`)
        }
      }
    }

    // ---- 8. placeholders left by `compass init` ----
    for (const [, what] of prose.matchAll(/<!--\s*compass:todo\b\s*([\s\S]*?)-->/g)) {
      warnings.push(`${name}: still has a placeholder${what.trim() ? ` — ${what.trim()}` : ''}`)
    }

    if (isMap) {
      // MAP.md carries a verbatim copy of each capsule's abstract so the map alone can route.
      for (const m of prose.matchAll(/\]\((capsules\/[^)]+)\)([^|\n]*)/g)) {
        linkedFromMap.set(m[1], m[2].replace(/^\s*—\s*/, '').trim())
      }
      // A union merge of two branches that both touched a row keeps both copies: identical, or the
      // same spoken task routed two ways. Either way one task now has two rows, which the map forbids.
      let tasks = new Map()
      for (const line of prose.split('\n')) {
        if (!line.startsWith('|')) {
          tasks = new Map() // a new table starts its own column
          continue
        }
        if (/^\|[\s|:-]+\|?$/.test(line)) continue
        const task = line.split('|')[1].trim().toLowerCase()
        if (task && tasks.has(task)) {
          errors.push(
            tasks.get(task) === line.trim()
              ? `${name}: row "${line.slice(2, 60).trim()}…" appears twice — likely left by a merge; delete one`
              : `${name}: two rows for the task "${task}" — likely left by a merge of two edits to one row; keep the right one`,
          )
        }
        tasks.set(task, line.trim())
        if (line.length > caps.mapRowChars) {
          warnings.push(`${name}: row "${line.slice(2, 60).trim()}…" is ${line.length} characters, cap is ${caps.mapRowChars} — the detail belongs in a capsule`)
        }
      }
    }
  }

  // ---- 9. MAP.md's copy of an abstract must match the capsule's own, character for character ----
  for (const [target, mapCopy] of linkedFromMap) {
    const own = capsuleAbstracts.get(target)
    if (own === undefined) continue
    if (!mapCopy) errors.push(`${config.store}/MAP.md: routes to '${target}' without its abstract — the row cannot be judged from the map`)
    else if (mapCopy !== own) {
      errors.push(`${config.store}/MAP.md: abstract for '${target}' does not match the capsule's own\n          map:     ${mapCopy}\n          capsule: ${own}`)
    }
  }

  // ---- 10. traps.md indexes itself, exactly ----
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

  // ---- 10b. the one-file-per-entry folders a team store keeps ----
  // No two branches should edit the same lines, and forges ignore merge drivers, so in team mode
  // what several people add to is a folder of files: an index or a list in one file would be the
  // line every branch edits. The folder listing is the index, so a file's name must say what it is.
  const heading = (text) => (withoutFences(text).match(/^#\s+(.+?)\s*$/m) ?? [])[1]
  const stateTitles = new Map()
  for (const file of files) {
    const fromStore = posix(relative(storeDir, file))
    const text = readFileSync(file, 'utf8')
    const fm = frontmatter(text)
    if (!fm) continue
    if (fromStore.startsWith('traps/')) {
      if (fm.type !== 'trap') errors.push(`${rel(file)}: a file in traps/ must have type: trap`)
      const h = heading(text)
      const want = h ? slug(h) + '.md' : null
      if (!h) errors.push(`${rel(file)}: a trap file needs a '#' heading worded as its symptom`)
      else if (fromStore.slice('traps/'.length) !== want) {
        errors.push(`${rel(file)}: named '${fromStore.slice('traps/'.length)}', but its heading makes it '${want}' — the file name is the index, so it must be the symptom`)
      }
    }
    if (fromStore.startsWith('state/')) {
      if (fm.type !== 'state') errors.push(`${rel(file)}: a file in state/ must have type: state`)
      if (!STATES.includes(fm.state)) errors.push(`${rel(file)}: 'state:' must be one of ${STATES.join(', ')} (got '${fm.state ?? ''}')`)
      if (fm.state === 'waiting' && !fm.waiting_on) errors.push(`${rel(file)}: state: waiting needs 'waiting_on:' — the person it waits on`)
      const h = heading(text)
      if (!h) errors.push(`${rel(file)}: a state item needs a '#' heading naming the item`)
      else if (stateTitles.has(h.toLowerCase())) {
        errors.push(`${rel(file)}: describes '${h}', and so does ${stateTitles.get(h.toLowerCase())} — one item, one file`)
      } else stateTitles.set(h.toLowerCase(), rel(file))
    }
    if (fromStore.startsWith('trajectories/') && fm.type !== 'log') errors.push(`${rel(file)}: a file in trajectories/ must have type: log`)
  }

  // ---- 10c. the state folder against the plan, like STATE.md in section 7 ----
  const stateFiles = files.filter((f) => posix(relative(storeDir, f)).startsWith('state/'))
  if (stateFiles.length) {
    const newest = stateFiles
      .map((f) => frontmatter(readFileSync(f, 'utf8'))?.verified)
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? ''))
      .sort()
      .at(-1)
    for (const [label, p] of newest ? planTracked : []) {
      const changed = commitDate(p)
      if (changed && changed > newest) {
        warnings.push(`${config.store}/state/: the ${label} (\`${p}\`) changed on ${changed}, after any state item was verified (newest ${newest}) — check the items still agree with it`)
      }
    }
  }

  // ---- 11. orphans: a capsule the map never routes to will never be read ----
  for (const file of files) {
    const fromStore = posix(relative(storeDir, file))
    if (fromStore.startsWith('capsules/') && !linkedFromMap.has(fromStore)) {
      warnings.push(`${rel(file)}: not routed to from MAP.md — no agent will ever load it`)
    }
  }

  // ---- 12. generated files: one config, every tool, no hand edits ----
  for (const { path, problem } of checkDrift(root, config)) {
    errors.push(`${path}: ${problem} — run \`compass sync\`, or change compass.config.json instead`)
  }

  // ---- 13. hints: a plan or decision folder the config does not name yet ----
  for (const h of hints(root, config)) {
    warnings.push(`compass.config.json: found \`${h.path}\` — if it holds this project's ${h.label}, set paths.${h.key} to it and run \`compass sync\` (or set it to false)`)
  }

  // ---- 14. this branch only: what it changed, and what it changed underneath a note ----
  let kept = warnings
  if (changed) {
    const pathOf = (msg) => msg.slice(0, msg.indexOf(':'))
    kept = warnings.filter((w) => changed.has(pathOf(w)))
    const hit = (p) => {
      const q = p.replace(/\/$/, '')
      return [...changed].filter((c) => c === q || c.startsWith(q + '/'))
    }
    for (const [note, paths] of describes) {
      if (changed.has(note)) continue
      const under = [...new Set([...paths].flatMap(hit))]
      if (under.length) {
        const list = under.slice(0, 3).map((p) => '`' + p + '`').join(', ') + (under.length > 3 ? ` and ${under.length - 3} more` : '')
        kept.push(`${note}: this branch changes ${list}, which this note describes, but not the note — check it still holds, then set verified`)
      }
    }
  }

  // ---- 15. whose it is: a problem with an owner gets fixed, an anonymous one gets ignored ----
  const withOwner = (msg) => {
    const who = owners.get(msg.slice(0, msg.indexOf(':')))
    return who ? `${msg} (owners: ${who.join(', ')})` : msg
  }

  return { errors: errors.map(withOwner), warnings: kept.map(withOwner), notes: files.length, changed: changed ? changed.size : null }
}

