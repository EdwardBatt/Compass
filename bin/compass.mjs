#!/usr/bin/env node
// compass — shared, agent-independent project orientation.
//   compass init     create compass.config.json and the store, then generate every tool's files
//   compass sync     regenerate every tool's files from compass.config.json
//   compass lint     rot detection; exit 1 on any error
//   compass doctor   show what Compass sees in this project
//   compass hook     install a git pre-commit hook that runs the lint
// Every command accepts --root <dir>; otherwise the root is found from the working directory.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { findRoot, loadConfig, CONFIG_FILE, TOOLS, DEFAULTS } from '../src/config.mjs'
import { sync, check, plan, context } from '../src/sync.mjs'
import { lint } from '../src/lint.mjs'
import { render } from '../src/render.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'))

const argv = process.argv.slice(2)
const cmd = argv[0] ?? 'help'
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

function copyStore(src, dest, ctx, created, root) {
  for (const entry of readdirSync(src)) {
    const from = join(src, entry)
    const to = join(dest, entry)
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyStore(from, to, ctx, created, root)
    } else if (!existsSync(to)) {
      writeFileSync(to, render(readFileSync(from, 'utf8').replace(/\r\n/g, '\n'), ctx))
      created.push(relative(root, to).replace(/\\/g, '/'))
    }
  }
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
      const starter = {
        version: 1,
        project: flag('project') ?? basename(root),
        owner: flag('owner') ?? DEFAULTS.owner,
        ownerCommits: false,
        store: DEFAULTS.store,
        tools,
        lintCommand: DEFAULTS.lintCommand,
        ci: false,
        paths: { plan: '', roadmap: '', adr: '', schema: '', rules: [] },
        state: DEFAULTS.state,
      }
      writeFileSync(join(root, CONFIG_FILE), JSON.stringify(starter, null, 2) + '\n')
      created.push(CONFIG_FILE)
    }
    const config = configOrDie(root)
    const storeDir = join(root, config.store)
    mkdirSync(storeDir, { recursive: true })
    copyStore(join(HERE, '..', 'templates', 'store'), storeDir, context(config), created, root)
    const changed = sync(root, config)
    for (const f of created) console.log('  created ' + f)
    for (const f of changed) console.log('  wrote   ' + f)
    console.log(`\ncompass: ready. Next: fill in ${CONFIG_FILE} (owner, paths), run \`compass sync\`, then write the store README's first paragraph.`)
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
    console.log(changed.length ? `compass sync: ${changed.length} file(s) updated` : 'compass sync: nothing to change')
  },

  lint() {
    const root = rootOrDie()
    const config = configOrDie(root)
    const { errors, warnings, notes } = lint(root, config)
    for (const w of warnings) console.warn('  warn  ' + w)
    for (const e of errors) console.error('  ERROR ' + e)
    if (errors.length) {
      console.error(`\ncompass lint: ${errors.length} error(s), ${warnings.length} warning(s)`)
      process.exit(1)
    }
    console.log(`compass lint: ${notes} notes clean` + (warnings.length ? `, ${warnings.length} warning(s) for a human to judge` : ''))
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
    const drift = new Map(check(root, config).map((d) => [d.path, d.problem]))
    for (const item of plan(config)) console.log(`        ${drift.has(item.path) ? '✗' : '✓'} ${item.path}${drift.has(item.path) ? ` — ${drift.get(item.path)}` : ''}`)
    let hook = 'not a git repository'
    try {
      const hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim()
      const file = join(root, hooks, 'pre-commit')
      hook = existsSync(file) && readFileSync(file, 'utf8').includes('compass') ? 'installed' : 'not installed (`compass hook`)'
    } catch {
      /* not a git repository */
    }
    console.log(`hook    ${hook}`)
    console.log(`ci      ${config.ci ? config.targets.ci : 'off'}`)
  },

  hook() {
    const root = rootOrDie()
    const config = configOrDie(root)
    const hooks = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, encoding: 'utf8' }).trim()
    const file = join(root, hooks, 'pre-commit')
    if (existsSync(file) && !readFileSync(file, 'utf8').includes('compass')) {
      console.error(`compass: ${file} already exists and is not Compass's — add \`${config.lintCommand}\` to it by hand`)
      process.exit(1)
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      `#!/bin/sh\n# compass: block a commit while the orientation store has errors\n${config.lintCommand} || { echo "Compass lint failed: fix the store, or run compass sync"; exit 1; }\n`,
      { mode: 0o755 },
    )
    console.log(`compass: pre-commit hook installed at ${relative(root, file)}`)
  },

  help() {
    console.log(`compass ${PKG.version}

  compass init [--project <name>] [--owner <name>] [--tools ${TOOLS.join(',')}]
  compass sync [--check]
  compass lint
  compass doctor
  compass hook

  All commands take --root <dir>. Without it, the root is the nearest folder holding
  ${CONFIG_FILE}, or the git top level.`)
  },
}

;(commands[cmd] ?? (() => {
  console.error(`compass: unknown command '${cmd}'`)
  commands.help()
  process.exit(2)
}))()
