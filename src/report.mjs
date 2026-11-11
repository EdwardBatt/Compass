// What the store's own history says about it, gathered across every session note, live and archived.
//
// One person's `missed:` field is a note to self. Across a team it is the best evidence Compass has:
// which tasks the map could not route, what they turned out to need, which capsules are actually
// loaded, what each person has in flight, and which ageing notes belong to whom. The lint judges a
// single snapshot; the report reads the trail.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { frontmatter, daysSince } from './lint.mjs'

const posix = (p) => p.replace(/\\/g, '/')

function mdFiles(dir, skip = new Set()) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      if (!skip.has(entry)) out.push(...mdFiles(p, skip))
    } else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

/** Every trajectory block in a note: { date, task, capsule, adrs, source, also, missed }. */
export function trajectories(text) {
  const out = []
  let cur = null
  for (const line of text.split(/\r?\n/)) {
    // The log's one-line form: `- trajectory: <date> — <task> | by: … | capsule: … | missed: …`
    const flat = line.match(/^\s*[-*]?\s*trajectory:\s*(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(.*?)\s*$/)
    if (flat && flat[2].includes(' | ')) {
      const [task, ...fields] = flat[2].split(' | ')
      const t = { date: flat[1], task: task.trim() }
      for (const f of fields) {
        const kv = f.match(/^\s*(capsule|adrs|source|also|missed|by):\s*(.*?)\s*$/)
        if (kv) t[kv[1]] = kv[2]
      }
      out.push(t)
      cur = null
      continue
    }
    const head = line.match(/^\s*trajectory:\s*(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(.*?)\s*$/)
    if (head) {
      cur = { date: head[1], task: head[2] }
      out.push(cur)
      continue
    }
    const kv = cur && line.match(/^\s+(capsule|adrs|source|also|missed|by):\s*(.*?)\s*$/)
    if (kv) cur[kv[1]] = kv[2]
    else cur = null
  }
  return out
}

const isNone = (v) => !v || /^[—–-]+$/.test(v.trim())
const unrouted = (t) => !t.capsule || /^none\b/i.test(t.capsule)

/** The open lines of a section such as **In flight** — struck-through lines are done. */
function openLines(text, label) {
  const out = []
  const re = new RegExp(`^\\s*(?:[-*]\\s+)?\\*\\*${label}\\*\\*\\s*[—–:-]*\\s*(.*)$`)
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re)
    // A struck line (`~~…~~`, usually followed by the commit that closed it) is done.
    if (m && m[1].trim() && !m[1].trim().startsWith('~~')) out.push(m[1].trim())
  }
  return out
}

function branchState(root, branch, current) {
  if (!branch) return null
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    git('rev-parse', '--git-dir')
  } catch {
    return null
  }
  if (branch === current) return 'current'
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    try {
      git('rev-parse', '--verify', '--quiet', ref)
    } catch {
      continue
    }
    try {
      git('merge-base', '--is-ancestor', ref, 'HEAD')
      return 'merged'
    } catch {
      return 'open'
    }
  }
  return 'gone'
}

/** Gathers the report. Pure data, so the CLI can print it or emit JSON. */
export function report(root, config, { today = new Date(), git = true } = {}) {
  const storeDir = join(root, config.store)
  const rel = (abs) => posix(relative(root, abs))
  let current = null
  if (git) {
    try {
      current = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
    } catch {
      /* not a git repository */
    }
  }

  const sessionFiles = [
    ...mdFiles(join(storeDir, 'sessions')).map((f) => ({ f, archived: false })),
    ...mdFiles(join(storeDir, 'archive')).map((f) => ({ f, archived: true })),
  ]
  const sessions = []
  const all = []
  const seen = new Set()
  // The same trajectory can sit in a session note and in the log (a note written before team mode,
  // then logged): count it once.
  const add = (t, note, author) => {
    const who = t.by || author || null
    const key = `${t.date}\u0000${t.task}\u0000${who}`
    if (seen.has(key)) return
    seen.add(key)
    all.push({ ...t, note, author: who })
  }
  let logs = 0
  // Team mode: one log per person in trajectories/. A single trajectories.md is read too, if a store has one.
  const single = join(storeDir, 'trajectories.md')
  const logFiles = [...(existsSync(single) ? [single] : []), ...mdFiles(join(storeDir, 'trajectories'))].map((f) => ({ f, archived: false }))
  for (const { f, archived } of [...logFiles, ...sessionFiles]) {
    const text = readFileSync(f, 'utf8')
    const fm = frontmatter(text)
    if (fm?.type === 'log') {
      logs++
      for (const t of trajectories(text)) add(t, rel(f), null)
      continue
    }
    if (!fm || fm.type !== 'session') continue
    const note = { path: rel(f), archived, author: fm.author || null, branch: fm.branch || null }
    sessions.push(note)
    for (const t of trajectories(text)) add(t, note.path, note.author)
    if (!archived) {
      note.inFlight = openLines(text, 'In flight')
      note.unresolved = openLines(text, 'Unresolved')
      note.branchState = git ? branchState(root, note.branch, current) : null
    }
  }
  all.sort((a, b) => a.date.localeCompare(b.date))

  const missedCounts = new Map()
  for (const t of all) {
    if (isNone(t.missed)) continue
    const key = t.missed.split(/\s+[—–]\s+/)[0].trim()
    missedCounts.set(key, (missedCounts.get(key) ?? 0) + 1)
  }
  const loads = new Map()
  for (const t of all) if (!unrouted(t)) loads.set(t.capsule, (loads.get(t.capsule) ?? 0) + 1)
  const capsules = mdFiles(join(storeDir, 'capsules')).map((f) => posix(relative(storeDir, f)))

  // What is waiting on a person, from the state items (team mode).
  const waiting = []
  for (const f of mdFiles(join(storeDir, 'state'))) {
    const text = readFileSync(f, 'utf8')
    const fm = frontmatter(text)
    if (fm?.state !== 'waiting') continue
    const title = (text.match(/^#\s+(.+?)\s*$/m) ?? [])[1] ?? rel(f)
    waiting.push({ path: rel(f), item: title, on: fm.waiting_on || null })
  }

  // Ageing notes, by who answers for them. Sessions age by the promote rule instead.
  const stale = []
  for (const f of mdFiles(storeDir, new Set(['archive', 'protocol', 'sessions']))) {
    const fm = frontmatter(readFileSync(f, 'utf8'))
    if (!fm || !['capsule', 'state', 'trap'].includes(fm.type) || fm.status !== 'current') continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.verified ?? '')) continue
    const age = daysSince(fm.verified, today)
    if (age > config.caps.staleDays) {
      const owners = Array.isArray(fm.owners) ? fm.owners : fm.owners ? [fm.owners] : []
      stale.push({ path: rel(f), age, owners })
    }
  }
  stale.sort((a, b) => b.age - a.age)

  return {
    logs,
    sessions: sessions.length,
    archived: sessions.filter((s) => s.archived).length,
    trajectories: all.length,
    unrouted: all.filter(unrouted).map(({ date, task, author, note }) => ({ date, task, author, note })),
    missed: all.filter((t) => !isNone(t.missed)).map(({ date, task, missed, author, note }) => ({ date, task, missed, author, note })),
    missedCounts: [...missedCounts].map(([what, count]) => ({ what, count })).sort((a, b) => b.count - a.count || a.what.localeCompare(b.what)),
    capsuleLoads: [...loads].map(([capsule, count]) => ({ capsule, count })).sort((a, b) => b.count - a.count),
    neverLoaded: capsules.filter((c) => !loads.has(c)),
    inFlight: sessions
      .filter((s) => !s.archived && (s.inFlight.length || s.unresolved.length))
      .map(({ path, author, branch, branchState, inFlight, unresolved }) => ({ path, author, branch, branchState, inFlight, unresolved })),
    waiting,
    stale,
  }
}

/** The report as text for a terminal. */
export function format(r, config) {
  const out = []
  const who = (a) => (a ? ` (${a})` : '')
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
  const from = [r.logs ? n(r.logs, 'trajectory log', 'trajectory logs') : null, `${n(r.sessions, 'session note', 'session notes')} (${r.archived} archived)`].filter(Boolean).join(' and ')
  out.push(`compass report — ${n(r.trajectories, 'trajectory', 'trajectories')} from ${from}`)
  if (!r.trajectories) {
    out.push(config.team ? '  No trajectories yet. Every close appends one line to its author’s log in trajectories/.' :'  No trajectories yet. They are written at close, into the rare session note; the report fills as they accumulate.')
  }

  out.push('', `Tasks the map could not route (${r.unrouted.length}) — each one is a MAP row worth adding`)
  for (const t of r.unrouted) out.push(`  ${t.date}  ${t.task}${who(t.author)}`)
  if (!r.unrouted.length) out.push('  none')

  out.push('', `What tasks needed that the map did not point at (${r.missed.length})`)
  for (const m of r.missedCounts.filter((m) => m.count > 1)) out.push(`  ${m.count}×  ${m.what}`)
  for (const t of r.missed) out.push(`  ${t.date}  ${t.task}${who(t.author)}\n        missed: ${t.missed}`)
  if (!r.missed.length) out.push('  none')

  out.push('', 'Capsules loaded')
  for (const c of r.capsuleLoads) out.push(`  ${c.count}×  ${c.capsule}`)
  for (const c of r.neverLoaded) out.push(`  0×  ${c} — never loaded in any recorded trajectory`)
  if (!r.capsuleLoads.length && !r.neverLoaded.length) out.push('  no capsules yet')

  if (config.team || r.inFlight.length) {
    out.push('', config.team ? 'In flight, by person' : 'Open in session notes')
    // A merged or deleted branch is a hint, never proof: a branch is often merged with work still
    // in flight (the model lands, the CLI follows). The author decides; the report only asks.
    const label = {
      gone: 'branch gone — are these lines still open? If not, its author strikes them or archives the note',
      merged: 'branch merged — are these lines still open? If not, its author strikes them or archives the note',
      current: 'this branch',
      open: null,
    }
    for (const s of r.inFlight) {
      const state = label[s.branchState] ? ` — ${label[s.branchState]}` : ''
      const whose = config.team ? `${s.author ?? 'no author'}${s.branch ? ` on ${s.branch}` : ''}: ` : ''
      out.push(`  ${whose}${s.path}${state}`)
      for (const l of s.inFlight) out.push(`        in flight:  ${l}`)
      for (const l of s.unresolved) out.push(`        unresolved: ${l}`)
    }
    if (!r.inFlight.length) out.push('  nothing open')
  }

  if (r.waiting.length) {
    out.push('', 'Waiting on a person')
    for (const w of r.waiting) out.push(`  ${w.on ?? 'nobody named'}: ${w.item} — ${w.path}`)
  }

  out.push('', `Notes unverified for more than ${config.caps.staleDays} days, by owner`)
  const byOwner = new Map()
  for (const s of r.stale) for (const o of s.owners.length ? s.owners : ['no owner']) byOwner.set(o, [...(byOwner.get(o) ?? []), s])
  for (const [o, notes] of [...byOwner].sort(([a], [b]) => (a === 'no owner') - (b === 'no owner') || a.localeCompare(b))) {
    out.push(`  ${o}`)
    for (const n of notes) out.push(`        ${n.path} — ${n.age} days`)
  }
  if (!r.stale.length) out.push('  none')
  return out.join('\n')
}
