// Finds the project root, loads compass.config.json, fills defaults and validates.
//
// Every path Compass reads or writes is resolved from the ROOT, never from the working directory,
// so `compass lint` gives the same answer from any subfolder of the project.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'

export const CONFIG_FILE = 'compass.config.json'
export const TOOLS = ['claude', 'cursor', 'gemini', 'antigravity', 'agents']
export const REPO = 'EdwardBatt/Compass'
/** The lint command for a pinned (or, with '', the latest) version of Compass. */
export const lintFor = (pin) => `npx --yes github:${REPO}${pin ? '#' + pin : ''} lint`
export const DEFAULT_LINT = lintFor('')

export const DEFAULTS = {
  version: 1,
  project: 'this project',
  owner: 'the project owner',
  // true: several people work on this repository at once. The procedures then speak to whoever is
  // running the agent (read from git at run time), keep in-flight work in per-person session notes
  // instead of STATE.md, and send decisions to `approvers`. Solo output is unchanged.
  team: false,
  // Team mode: who accepts decision records. Empty: the owner.
  approvers: [],
  // true: agents never commit; the close routine ends by handing the owner the commit text.
  ownerCommits: false,
  store: 'docs/compass',
  tools: ['claude', 'agents'],
  // The Compass version (a git tag such as 'v0.3.0') this project runs. CI checks it out, and the
  // default lintCommand uses it. '' = the latest commit on main.
  pin: '',
  // What agents are told to run. Unset: derived from `pin`. A project with an npm script usually
  // points this at it.
  lintCommand: DEFAULT_LINT,
  ci: false,
  // '' = not set yet (Compass suggests candidates it finds); false = this project has none.
  paths: { plan: '', roadmap: '', adr: '', schema: '', rules: [] },
  // Markdown lines, highest authority first. Empty: derived from `paths`.
  authority: [],
  state: { inFlight: 'In flight right now', waiting: 'Waiting on a person' },
  // One extra line appended to every tool's pointer block, for a project-specific caution.
  pointerNote: '',
  targets: {
    claudeRules: 'CLAUDE.md',
    claudeCommands: '.claude/commands',
    cursor: '.cursor/rules/compass.mdc',
    gemini: 'GEMINI.md',
    antigravity: '.agent/rules/compass.md',
    agents: 'AGENTS.md',
    ci: '.github/workflows/compass.yml',
    // Team mode: the committed hooks folder `compass hook` points git's core.hooksPath at.
    hooks: '.githooks',
  },
  caps: {
    capsuleLines: 60, // a capsule points at source, it does not reproduce it
    abstractChars: 140, // the load-or-skip line: long enough to route, too short to weigh
    staleDays: 30, // a note unchecked for longer is a claim about the past
    promoteDays: 14, // a session note this old is either durable or archivable
    mapRowChars: 1200, // a MAP row longer than this has become a capsule without the name
    trapsIndexChars: 6000, // the traps index is read whole; the entries are not
    fileChars: { 'README.md': 8000, 'MAP.md': 12000, 'STATE.md': 16000 },
    logChars: 12000, // a trajectory log (team mode) past this is archived; nobody reads it whole
  },
  // Backticked path prefixes the lint must not resolve (generated, external or illustrative paths).
  ignorePaths: [],
}

/** Walks up from `start` to the folder holding compass.config.json; falls back to the git top level. */
export function findRoot(start = process.cwd()) {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (top) return resolve(top)
  } catch {
    /* not a git repository */
  }
  return null
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function merge(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v)
  return out
}

/** Returns { config, errors }. `errors` are configuration mistakes; the caller decides whether to stop. */
export function loadConfig(root) {
  const file = join(root, CONFIG_FILE)
  if (!existsSync(file)) {
    return { config: structuredClone(DEFAULTS), errors: [`no ${CONFIG_FILE} at ${root} — run \`compass init\``] }
  }
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { config: structuredClone(DEFAULTS), errors: [`${CONFIG_FILE} is not valid JSON: ${e.message}`] }
  }
  const config = merge(structuredClone(DEFAULTS), raw)
  if (raw.lintCommand === undefined && typeof config.pin === 'string') config.lintCommand = lintFor(config.pin)
  return { config, errors: validate(config, root) }
}

export function validate(config, root) {
  const errors = []
  if (config.version !== 1) errors.push(`${CONFIG_FILE}: version must be 1 (got ${JSON.stringify(config.version)})`)
  if (!Array.isArray(config.tools)) errors.push(`${CONFIG_FILE}: tools must be a list`)
  else {
    for (const t of config.tools) {
      if (!TOOLS.includes(t)) errors.push(`${CONFIG_FILE}: unknown tool '${t}' — known: ${TOOLS.join(', ')}`)
    }
  }
  for (const key of ['project', 'owner', 'store', 'lintCommand']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) errors.push(`${CONFIG_FILE}: '${key}' must be a non-empty string`)
  }
  const relPaths = [['store', config.store], ...Object.entries(config.targets ?? {}).map(([k, v]) => [`targets.${k}`, v])]
  for (const [key, p] of relPaths) {
    if (typeof p !== 'string' || isAbsolute(p) || p.split(/[\\/]/).includes('..')) {
      errors.push(`${CONFIG_FILE}: '${key}' must be a path inside the project (got ${JSON.stringify(p)})`)
    }
  }
  if (typeof config.pin !== 'string' || !/^[\w.\/-]*$/.test(config.pin)) {
    errors.push(`${CONFIG_FILE}: pin must be a Compass tag such as "v0.3.0", or '' for the latest (got ${JSON.stringify(config.pin)})`)
  }
  if (typeof config.team !== 'boolean') errors.push(`${CONFIG_FILE}: team must be true or false`)
  if (!Array.isArray(config.approvers) || config.approvers.some((a) => typeof a !== 'string' || !a.trim())) {
    errors.push(`${CONFIG_FILE}: approvers must be a list of names`)
  }
  if (!Array.isArray(config.authority)) errors.push(`${CONFIG_FILE}: authority must be a list of Markdown lines`)
  if (!Array.isArray(config.paths?.rules)) errors.push(`${CONFIG_FILE}: paths.rules must be a list`)
  for (const key of ['plan', 'roadmap', 'adr', 'schema']) {
    const v = config.paths?.[key]
    if (typeof v !== 'string' && v !== false) {
      errors.push(`${CONFIG_FILE}: paths.${key} must be a path, '' (not set yet) or false (this project has none)`)
    }
  }
  // A configured path that does not exist would send every agent to a file that is not there.
  if (root) {
    const p = config.paths ?? {}
    for (const [key, value] of [['plan', p.plan], ['roadmap', p.roadmap], ['adr', p.adr], ['schema', p.schema], ...(p.rules ?? []).map((r) => ['rules', r])]) {
      if (typeof value === 'string' && value && !existsSync(join(root, value))) errors.push(`${CONFIG_FILE}: paths.${key} '${value}' does not exist`)
    }
  }
  return errors
}
