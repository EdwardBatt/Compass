#!/usr/bin/env node
// compass — shared, agent-independent project orientation.
//   compass init     create compass.config.json and the store, then generate every tool's files
//   compass sync     regenerate every tool's files from compass.config.json
//   compass lint     rot detection; exit 1 on any error
//   compass report   what the session notes say: unrouted tasks, misses, in-flight work, stale notes
//   compass doctor   show what Compass sees in this project
//   compass hook     install a git pre-commit hook that runs the lint
//   compass version  print the version
// Every command accepts --root <dir>; otherwise the root is found from the working directory.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, chmodSync } from 'node:fs'
import { join, dirname, basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { findRoot, loadConfig, CONFIG_FILE, TOOLS, DEFAULTS } from '../src/config.mjs'
import { sync, check, plan, context } from '../src/sync.mjs'
import { lint } from '../src/lint.mjs'
import { render } from '../src/render.mjs'
import { discover, hints } from '../src/discover.mjs'
import { hookScript } from '../src/hook.mjs'
import { report, format } from '../src/report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'))

const argv = process.argv.slice(2)
const cmd = argv[0] === '--version' || argv[0] === '-v' ? 'version' : argv[0] === '--help' || argv[0] === '-h' ? 'help' : (argv[0] ?? 'help')
const flag = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? (argv[i + 1] ?? '') : undefined
}

function rootOrDie() {
  const given = flag('root')
  const root = given ? given : findRoot()
  if (!root) {
    console.error('compass: not inside a project — no compass.config.json found and not in a git repository')
    process.exit(2)
  }
  return root
}

function configOrDie(root) {
  const { config, errors } = loadConfig(root)
  if (errors.length) {
    for (const e of errors) console.error('  ERROR ' + e)
    process.exit(1)
  }
  return config
}

// A team store keeps what is built, the traps and the trajectories one file per entry, in folders,
// so two branches never edit the same lines; a solo store keeps them as single files. Running `init`
// again after switching team mode on creates the folders and leaves every existing note alone.
const TEAM_ONLY = new Set(['state', 'traps', 'trajectories'])
const SOLO_ONLY = new Set(['STATE.md', 'traps.md'])

function copyStore(src, dest, ctx, created, root) {
  for (const entry of readdirSync(src)) {
    const from = join(src, entry)
    const to = join(dest, entry)
    if ((TEAM_ONLY.has(entry) && !ctx.team) || (SOLO_ONLY.has(entry) && ctx.team)) continue
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyStore(from, to, ctx, created, root)
    } else if (!existsSync(to)) {
      writeFileSync(to, render(readFileSync(from, 'utf8').replace(/\r\n/g, '\n'), ctx))
      created.push(relative(root, to).replace(/\\/g, '/'))
    }
  }
}

/** Warns when this copy of Compass is not the version the project pins: its output would differ. */
function pinNote(config) {
  if (config.pin && config.pin !== `v${PKG.version}`) {
    console.warn(`  note  this is Compass ${PKG.version}, but ${CONFIG_FILE} pins ${config.pin}. Run sync with github:EdwardBatt/Compass#${config.pin}, or set "pin": "v${PKG.version}" to upgrade.`)
  }
}

function gitUserName(root) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const gitOr = (root, fallback, ...args) => {
  try {
    return git(root, ...args)
  } catch {
    return fallback
  }
}

/**
 * core.hooksPath for the hooks folder, relative to the repository's top level (which may sit above
 * the root). Git says where the root is inside the repository (`--show-prefix`), so no two path
 * spellings are compared: on Windows the same folder can be C:\Users\RUNNER~1\… or
 * C:/Users/runneradmin/…, and path.relative() between them walks out of the repository.
 */
function hooksPathFor(root, dir) {
  const prefix = git(root, 'rev-parse', '--show-prefix') // '' at the top level, else 'sub/dir/'
  return (prefix + dir).replace(/\\/g, '/').replace(/\/$/, '')
}

/**
 * Team mode: the hook is committed in targets.hooks, and each clone points core.hooksPath at it.
 * Moving hooksPath silently disables every hook in .git/hooks, so it refuses while one exists that
 * is not Compass's own, and it never takes over a hooksPath another tool (husky, lefthook) set.
 */
function installSharedHook(root, config) {
  const dir = config.targets.hooks
  if (gitOr(root, null, 'rev-parse', '--git-dir') === null) {
    console.error('compass: not a git repository — run `git init` first, then `compass hook`')
    process.exit(1)
  }
  const file = join(root, dir, 'pre-commit')
  if (!existsSync(file)) {
    console.error(`compass: ${dir}/pre-commit is missing — run \`compass sync\` first`)
    process.exit(1)
  }
  const want = hooksPathFor(root, dir)
  const current = gitOr(root, '', 'config', '--get', 'core.hooksPath')
  if (current && current.replace(/\/$/, '') !== want) {
    console.error(`compass: core.hooksPath is already '${current}' (another hook manager?) — add \`${config.lintCommand}\` to its pre-commit by hand`)
    process.exit(1)
  }
  if (!current) {
    const own = join(resolve(root, git(root, 'rev-parse', '--git-common-dir')), 'hooks')
    const others = existsSync(own)
      ? readdirSync(own).filter((f) => !f.endsWith('.sample') && !readFileSync(join(own, f), 'utf8').includes('compass'))
      : []
    if (others.length) {
      console.error(`compass: .git/hooks has hooks Compass did not write (${others.join(', ')}). Pointing git at ${want}/ would stop them running — move them into ${want}/ first, then rerun.`)
      process.exit(1)
    }
    git(root, 'config', 'core.hooksPath', want)
  }
  chmodSync(file, 0o755)
  console.log(`  hook    ${want}/pre-commit (core.hooksPath) — commits are blocked while the lint has errors`)
}

function installHook(root, config) {
  if (config.team) return installSharedHook(root, config)
  let hooks
  try {
    hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    console.error('compass: not a git repository — run `git init` first, then `compass hook`')
    process.exit(1)
  }
  const file = join(root, hooks, 'pre-commit')
  if (existsSync(file) && !readFileSync(file, 'utf8').includes('compass')) {
    console.error(`compass: ${file} already exists and is not Compass's — add \`${config.lintCommand}\` to it by hand`)
    process.exit(1)
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, hookScript(config.lintCommand), { mode: 0o755 })
  console.log(`  hook    ${relative(root, file).replace(/\\/g, '/')} — commits are blocked while the lint has errors`)
}

const commands = {
  init() {
    const root = flag('root') ?? findRoot() ?? process.cwd()
    const created = []
    if (!existsSync(join(root, CONFIG_FILE))) {
      const tools = flag('tools') ? flag('tools').split(',').map((s) => s.trim()) : DEFAULTS.tools
      const bad = tools.filter((t) => !TOOLS.includes(t))
      if (bad.length) {
        console.error(`compass: unknown tool(s) ${bad.join(', ')} — known: ${TOOLS.join(', ')}`)
        process.exit(2)
      }
      const owner = flag('owner') ?? gitUserName(root) ?? DEFAULTS.owner
      const team = argv.includes('--team')
      const found = discover(root)
      const starter = {
        version: 1,
        project: flag('project') ?? basename(root),
        owner,
        ...(team ? { team: true, approvers: [owner] } : {}),
        ownerCommits: false,
        store: DEFAULTS.store,
        tools,
        pin: `v${PKG.version}`,
        ci: argv.includes('--ci'),
        paths: { plan: found.plan ?? '', roadmap: found.roadmap ?? '', adr: found.adr ?? '', schema: found.schema ?? '', rules: [] },
        state: { ...DEFAULTS.state, waiting: team ? 'Waiting on a person' : `Waiting on ${owner}` },
      }
      writeFileSync(join(root, CONFIG_FILE), JSON.stringify(starter, null, 2) + '\n')
      created.push(CONFIG_FILE)
      for (const [key, path] of Object.entries(found)) console.log(`  found   ${path} → paths.${key}`)
    }
    const config = configOrDie(root)
    const storeDir = join(root, config.store)
    mkdirSync(storeDir, { recursive: true })
    copyStore(join(HERE, '..', 'templates', 'store'), storeDir, context(config), created, root)
    const changed = sync(root, config)
    for (const f of created) console.log('  created ' + f)
    for (const f of changed.filter((c) => !created.includes(c))) console.log('  wrote   ' + f)
    if (argv.includes('--hook')) installHook(root, config)

    const missing = ['plan', 'adr'].filter((k) => config.paths[k] === '')
    const steps = [
      `Write the first paragraph of ${config.store}/README.md: what this project is, in three or four sentences.`,
      missing.includes('plan')
        ? `Write a plan (a short list of milestones in any Markdown file), set paths.plan in ${CONFIG_FILE}, and run \`compass sync\`.`
        : `Check paths in ${CONFIG_FILE}; Compass pre-filled what it found.`,
      config.tools.includes('claude')
        ? 'Start every session with `/compass-start <task>` and end it with `/compass-close`. With no task, `/compass-start` proposes one.'
        : `Ask your agent to follow ${config.store}/protocol/start.md before work and close.md after it.`,
    ]
    if (!config.ci) steps.push('Enforce the lint in CI: set "ci": true and run `compass sync` (or rerun init with --ci).')
    if (!argv.includes('--hook')) steps.push('Block commits while the store has errors: `compass hook`.')
    console.log('\ncompass: ready. Next:\n' + steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'))
  },

  sync() {
    const root = rootOrDie()
    const config = configOrDie(root)
    if (argv.includes('--check')) {
      const drift = check(root, config)
      for (const d of drift) console.error(`  ERROR ${d.path}: ${d.problem}`)
      if (drift.length) process.exit(1)
      console.log('compass sync: every generated file is current')
      return
    }
    const changed = sync(root, config)
    for (const f of changed) console.log('  wrote ' + f)
    pinNote(config)
    console.log(changed.length ? `compass sync: ${changed.length} file(s) updated` : 'compass sync: nothing to change')
  },

  lint() {
    const root = rootOrDie()
    const config = configOrDie(root)
    const base = flag('base')
    if (base === '') {
      console.error('compass: --base needs a git ref, such as origin/main')
      process.exit(2)
    }
    let result
    try {
      result = lint(root, config, { base })
    } catch (e) {
      console.error('compass: ' + e.message)
      process.exit(2)
    }
    const { errors, warnings, notes, changed } = result
    const scope = base ? ` (warnings scoped to the ${changed} file(s) changed since ${base})` : ''
    for (const w of warnings) console.warn('  warn  ' + w)
    for (const e of errors) console.error('  ERROR ' + e)
    if (errors.length) {
      console.error(`\ncompass lint: ${errors.length} error(s), ${warnings.length} warning(s)${scope}`)
      process.exit(1)
    }
    console.log(`compass lint: ${notes} notes clean` + (warnings.length ? `, ${warnings.length} warning(s) for a human to judge` : '') + scope)
  },

  report() {
    const root = rootOrDie()
    const config = configOrDie(root)
    const r = report(root, config)
    console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : format(r, config))
  },

  doctor() {
    const root = rootOrDie()
    console.log(`compass ${PKG.version} · node ${process.version}`)
    console.log(`root    ${root}`)
    const { config, errors } = loadConfig(root)
    console.log(`config  ${existsSync(join(root, CONFIG_FILE)) ? CONFIG_FILE : 'missing'}${errors.length ? ` — ${errors.length} problem(s)` : ''}`)
    for (const e of errors) console.log('        ' + e)
    console.log(`store   ${config.store} ${existsSync(join(root, config.store)) ? '' : '(missing)'}`)
    console.log(`tools   ${config.tools.join(', ')}`)
    const approvers = (config.approvers.length ? config.approvers : [config.owner]).join(', ')
    console.log(`team    ${config.team ? `on — decision records accepted by ${approvers}` : 'off — one person at a time'}`)
    const drift = new Map(check(root, config).map((d) => [d.path, d.problem]))
    for (const item of plan(config)) console.log(`        ${drift.has(item.path) ? '✗' : '✓'} ${item.path}${drift.has(item.path) ? ` — ${drift.get(item.path)}` : ''}`)
    let hook = 'not a git repository'
    try {
      const hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim()
      const file = join(root, hooks, 'pre-commit')
      hook = existsSync(file) && readFileSync(file, 'utf8').includes('compass') ? 'installed' : 'not installed (`compass hook`)'
      if (config.team) {
        const want = hooksPathFor(root, config.targets.hooks)
        const current = gitOr(root, '', 'config', '--get', 'core.hooksPath').replace(/\/$/, '')
        hook = current === want ? `installed — core.hooksPath is ${want}` : `not installed in this clone — run \`compass hook\` (core.hooksPath is ${current ? `'${current}'` : 'unset'})`
      }
    } catch {
      /* not a git repository */
    }
    console.log(`hook    ${hook}`)
    console.log(`ci      ${config.ci ? config.targets.ci : 'off'}`)
    console.log(`pin     ${config.pin || 'none — the latest commit on main'}`)
    console.log(`lint    ${config.lintCommand}`)
    pinNote(config)
    for (const key of ['plan', 'roadmap', 'adr', 'schema']) {
      const v = config.paths[key]
      console.log(`${key.padEnd(8)}${v === false ? 'none (set to false)' : v || 'not set'}`)
    }
    for (const h of hints(root, config)) console.log(`hint    found ${h.path} — set paths.${h.key} if it holds the ${h.label}`)
  },

  hook() {
    const root = rootOrDie()
    installHook(root, configOrDie(root))
  },

  version() {
    console.log(PKG.version)
  },

  help() {
    console.log(`compass ${PKG.version}

  compass init [--project <name>] [--owner <name>] [--tools ${TOOLS.join(',')}] [--team] [--ci] [--hook]
  compass sync [--check]
  compass lint [--base <ref>]   with --base, warnings cover only what this branch changed
  compass report [--json]
  compass doctor
  compass hook
  compass version

  All commands take --root <dir>. Without it, the root is the nearest folder holding
  ${CONFIG_FILE}, or the git top level.`)
  },
}

;(commands[cmd] ?? (() => {
  console.error(`compass: unknown command '${cmd}'`)
  commands.help()
  process.exit(2)
}))()
