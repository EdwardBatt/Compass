import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadConfig, findRoot } from '../src/config.mjs'
import { lint, slug } from '../src/lint.mjs'
import { sync, check } from '../src/sync.mjs'
import { render } from '../src/render.mjs'
import { hookScript } from '../src/hook.mjs'
import { report, format } from '../src/report.mjs'

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'compass.mjs')

/** A fresh project created by `compass init`, which must lint clean before any test breaks it. */
function project(tools = 'claude,cursor,gemini,antigravity,agents') {
  const root = mkdtempSync(join(tmpdir(), 'compass-'))
  execFileSync(process.execPath, [BIN, 'init', '--root', root, '--project', 'Demo', '--owner', 'Sam', '--tools', tools])
  return root
}
const write = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const run = (root) => {
  const { config, errors } = loadConfig(root)
  assert.deepEqual(errors, [])
  return lint(root, config, { git: false })
}
const capsule = (abstract, body = 'Points at `src/app.ts`.') =>
  `---\ntype: capsule\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\nabstract: ${abstract}\nsources: []\n---\n\n# X\n\n${body}\n`

test('init produces a store that lints clean, and every tool file', () => {
  const root = project()
  const { errors } = run(root)
  assert.deepEqual(errors, [])
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursor/rules/compass.mdc', '.agent/rules/compass.md', '.claude/commands/compass-start.md', 'docs/compass/protocol/close.md']) {
    assert.ok(read(root, f).length > 0, f)
  }
  assert.match(read(root, '.claude/commands/compass-start.md'), /\$ARGUMENTS/)
  assert.doesNotMatch(read(root, 'docs/compass/protocol/start.md'), /\$ARGUMENTS/)
  rmSync(root, { recursive: true })
})

test('sync is idempotent and keeps the rest of a host file', () => {
  const root = project('claude')
  write(root, 'CLAUDE.md', '# Mine\n\nKeep this.\n\n' + read(root, 'CLAUDE.md').split('\n').slice(2).join('\n'))
  const { config } = loadConfig(root)
  sync(root, config)
  const once = read(root, 'CLAUDE.md')
  assert.deepEqual(sync(root, config), [])
  assert.equal(read(root, 'CLAUDE.md'), once)
  assert.match(once, /Keep this\./)
  rmSync(root, { recursive: true })
})

test('a hand edit to a generated file or block is an error', () => {
  const root = project('claude,cursor')
  write(root, '.cursor/rules/compass.mdc', read(root, '.cursor/rules/compass.mdc') + '\nmy tweak\n')
  write(root, 'CLAUDE.md', read(root, 'CLAUDE.md').replace('Most sessions write nothing', 'Always write something'))
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.startsWith('.cursor/rules/compass.mdc')))
  assert.ok(errors.some((e) => e.startsWith('CLAUDE.md')))
  rmSync(root, { recursive: true })
})

test('it runs the same from a subdirectory', () => {
  const root = project('agents')
  mkdirSync(join(root, 'deep', 'er'), { recursive: true })
  assert.equal(findRoot(join(root, 'deep', 'er')), root)
  const out = execFileSync(process.execPath, [BIN, 'lint'], { cwd: join(root, 'deep', 'er'), encoding: 'utf8' })
  assert.match(out, /notes clean/)
  rmSync(root, { recursive: true })
})

test('a backticked path in MAP.md that does not exist is an error; elsewhere a warning', () => {
  const root = project('agents')
  write(root, 'src/app.ts', '')
  const map = read(root, 'docs/compass/MAP.md')
  write(root, 'docs/compass/MAP.md', map + '| Billing | `src/app.ts`, `lib/short.ts`, `text/plain`, `/de` | — |\n')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md') + '\nSee `lib/other.ts`.\n')
  const { errors, warnings } = run(root)
  assert.ok(errors.some((e) => e.includes('`lib/short.ts` does not exist')))
  assert.ok(!errors.some((e) => e.includes('src/app.ts') || e.includes('text/plain') || e.includes('/de')))
  assert.ok(warnings.some((w) => w.includes('`lib/other.ts`')))
  rmSync(root, { recursive: true })
})

test('paths inside fenced code are not checked', () => {
  const root = project('agents')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md') + '\n```\n`nope/x.ts` [a](missing.md)\n```\n')
  const { errors, warnings } = run(root)
  assert.deepEqual(errors, [])
  assert.ok(!warnings.some((w) => w.includes('nope/x.ts')))
  rmSync(root, { recursive: true })
})

test('the traps index must match headings exactly, with the right anchors', () => {
  const root = project('agents')
  const base = read(root, 'docs/compass/traps.md')
  const head = base.slice(0, base.lastIndexOf('---'))
  write(root, 'docs/compass/traps.md', head + '- [The build fails](#the-build-fails)\n- [Ghost](#ghost)\n\n---\n\n### The build fails on Tuesdays\n\nx\n')
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.includes("'The build fails on Tuesdays' is not in the index")), 'substring must not count')
  assert.ok(errors.some((e) => e.includes("lists 'Ghost'")))
  write(root, 'docs/compass/traps.md', head + '- [Uses `.env.local`](#wrong)\n\n---\n\n### Uses `.env.local`\n\nx\n')
  assert.ok(run(root).errors.some((e) => e.includes('its anchor is #uses-envlocal')))
  write(root, 'docs/compass/traps.md', head + '- [Uses `.env.local`](#uses-envlocal)\n\n---\n\n### Uses `.env.local`\n\nx\n')
  assert.deepEqual(run(root).errors, [])
  rmSync(root, { recursive: true })
})

test('dead anchors and dead links are errors', () => {
  const root = project('agents')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md') + '\n[a](traps.md#nowhere) [b](gone.md) [c](#working)\n')
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.includes('#nowhere')))
  assert.ok(errors.some((e) => e.includes("'gone.md' does not exist")))
  assert.ok(!errors.some((e) => e.includes('#working')))
  rmSync(root, { recursive: true })
})

test('a mistyped type, a missing source and a future date are errors', () => {
  const root = project('agents')
  write(root, 'docs/compass/capsules/x.md', capsule('One line.').replace('type: capsule', 'type: capsul'))
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace('sources: []', 'sources: [src/gone.ts]').replace(/verified: .*/, 'verified: 2999-01-01'))
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.includes("got 'capsul'")))
  assert.ok(errors.some((e) => e.includes("source 'src/gone.ts' does not exist")))
  assert.ok(errors.some((e) => e.includes('is in the future')))
  rmSync(root, { recursive: true })
})

test('capsule abstract rules and the MAP copy', () => {
  const root = project('agents')
  write(root, 'src/app.ts', '')
  write(root, 'docs/compass/capsules/billing.md', capsule('How money moves. Then more.'))
  assert.ok(run(root).errors.some((e) => e.includes('more than one sentence')))
  write(root, 'docs/compass/capsules/billing.md', capsule('How money moves.'))
  const map = read(root, 'docs/compass/MAP.md')
  write(root, 'docs/compass/MAP.md', map.replace('|---|---|---|---|\n', '|---|---|---|---|\n| "billing" | [billing](capsules/billing.md) — How money flows. | `src/app.ts` | — |\n'))
  assert.ok(run(root).errors.some((e) => e.includes('does not match the capsule')))
  write(root, 'docs/compass/MAP.md', map.replace('|---|---|---|---|\n', '|---|---|---|---|\n| "billing" | [billing](capsules/billing.md) — How money moves. | `src/app.ts` | — |\n'))
  assert.deepEqual(run(root).errors, [])
  rmSync(root, { recursive: true })
})

test('the git staleness check warns when a source changed after verified', () => {
  const root = project('agents')
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  write(root, 'src/app.ts', 'x')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace('sources: []', 'sources: [src/app.ts]').replace(/verified: .*/, 'verified: 2000-01-01'))
  git('add', '.')
  git('commit', '-qm', 'x')
  const { config } = loadConfig(root)
  const { warnings } = lint(root, config)
  assert.ok(warnings.some((w) => w.includes("source 'src/app.ts' changed on")))
  rmSync(root, { recursive: true, force: true })
})

test('config errors are reported', () => {
  const root = project('agents')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  write(root, 'compass.config.json', JSON.stringify({ ...cfg, tools: ['claude', 'vim'], paths: { ...cfg.paths, plan: 'nope.md' }, store: '../x' }))
  const { errors } = loadConfig(root)
  assert.ok(errors.some((e) => e.includes("unknown tool 'vim'")))
  assert.ok(errors.some((e) => e.includes("paths.plan 'nope.md' does not exist")))
  assert.ok(errors.some((e) => e.includes("'store' must be a path inside the project")))
  rmSync(root, { recursive: true })
})

test('render: nested ifs, else, and unset values fail loudly', () => {
  assert.equal(render('{{#if a}}A{{#if b}}B{{else}}c{{/if}}{{/if}}', { a: 1, b: 0 }), 'Ac')
  assert.equal(render('{{#if x}}y{{else}}n{{/if}}', { x: [] }), 'n')
  assert.throws(() => render('{{missing}}', {}), /missing/)
})

test('slug follows GitHub', () => {
  assert.equal(slug('Every Supabase command fails on `[inbucket]`, or `--linked` answers 403'), 'every-supabase-command-fails-on-inbucket-or---linked-answers-403')
  assert.equal(slug("Meta's dashboard says"), 'metas-dashboard-says')
})

test('check reports a missing block in an existing host file', () => {
  const root = project('agents')
  write(root, 'AGENTS.md', '# Mine\n')
  const { config } = loadConfig(root)
  assert.deepEqual(check(root, config), [{ path: 'AGENTS.md', problem: 'has no Compass block' }])
  rmSync(root, { recursive: true })
})

// ---------------------------------------------------------------- 0.2.0: from a blank repository

const gitRepo = (root) => {
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'Robin Example')
  return git
}

test('a fresh store warns about the README placeholder until it is written', () => {
  const root = project('agents')
  const { warnings } = run(root)
  assert.ok(warnings.some((w) => w.includes('README.md: still has a placeholder')))
  write(root, 'docs/compass/README.md', read(root, 'docs/compass/README.md').replace(/<!-- compass:todo[^>]*-->\n/, ''))
  assert.ok(!run(root).warnings.some((w) => w.includes('placeholder')))
  rmSync(root, { recursive: true })
})

test('init takes the owner from git, finds the plan and decision records, and pre-fills the config', () => {
  const root = mkdtempSync(join(tmpdir(), 'compass-'))
  gitRepo(root)
  write(root, 'plan.md', '# Plan\n')
  write(root, 'docs/adr/0001-x.md', '# x\n')
  const out = execFileSync(process.execPath, [BIN, 'init', '--root', root, '--tools', 'claude'], { encoding: 'utf8' })
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  assert.equal(cfg.owner, 'Robin Example')
  assert.equal(cfg.state.waiting, 'Waiting on Robin Example')
  assert.equal(cfg.paths.plan, 'plan.md', 'reports the spelling on disk')
  assert.equal(cfg.paths.adr, 'docs/adr/')
  assert.match(out, /found\s+plan\.md → paths\.plan/)
  assert.match(out, /compass hook/)
  rmSync(root, { recursive: true, force: true })
})

test('the lint hints at an unset path it can fill, and false silences it', () => {
  const root = project('agents')
  write(root, 'ROADMAP.md', '# Roadmap\n')
  assert.ok(run(root).warnings.some((w) => w.includes('found `ROADMAP.md`') && w.includes('paths.roadmap')))
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  cfg.paths.roadmap = false
  write(root, 'compass.config.json', JSON.stringify(cfg))
  assert.ok(!run(root).warnings.some((w) => w.includes('ROADMAP.md')))
  rmSync(root, { recursive: true })
})

test('STATE is checked against the configured plan, once, without being listed as a source', () => {
  const root = project('agents')
  const git = gitRepo(root)
  write(root, 'PLAN.md', '# Plan\n')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  cfg.paths.plan = 'PLAN.md'
  write(root, 'compass.config.json', JSON.stringify(cfg))
  execFileSync(process.execPath, [BIN, 'sync', '--root', root])
  const state = read(root, 'docs/compass/STATE.md').replace(/verified: .*/, 'verified: 2000-01-01')
  write(root, 'docs/compass/STATE.md', state)
  git('add', '.')
  git('commit', '-qm', 'x')
  const { config } = loadConfig(root)
  let drift = lint(root, config).warnings.filter((w) => w.includes('PLAN.md'))
  assert.equal(drift.length, 1)
  assert.match(drift[0], /the plan \(`PLAN.md`\) changed on .*after STATE was verified/)
  // Listing the plan as a source too must not report it twice.
  write(root, 'docs/compass/STATE.md', state.replace('sources: []', 'sources: [PLAN.md, docs/compass/MAP.md]'))
  drift = lint(root, config).warnings.filter((w) => w.includes('PLAN.md'))
  assert.equal(drift.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('session notes are not checked against later changes to their sources', () => {
  const root = project('agents')
  const git = gitRepo(root)
  write(root, 'src/app.ts', 'x')
  write(root, 'docs/compass/sessions/2000-01-01.md', '---\ntype: session\nstatus: current\norigin: ai-derived\nverified: 2000-01-01\nsources: [src/app.ts]\n---\n\n# Session\n')
  git('add', '.')
  git('commit', '-qm', 'x')
  const { config } = loadConfig(root)
  const { warnings } = lint(root, config)
  assert.ok(!warnings.some((w) => w.includes("source 'src/app.ts' changed")))
  assert.ok(warnings.some((w) => w.includes('promote what is durable')))
  rmSync(root, { recursive: true, force: true })
})

test('start tells an empty project what to do first, and drops it once a plan is set', () => {
  const root = project('agents')
  assert.match(read(root, 'docs/compass/protocol/start.md'), /No plan is configured/)
  assert.match(read(root, 'docs/compass/protocol/start.md'), /If the store is still empty/)
  assert.match(read(root, 'docs/compass/protocol/close.md'), /\*\*7\. The config\*\*/)
  write(root, 'PLAN.md', '# Plan\n')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  cfg.paths.plan = 'PLAN.md'
  write(root, 'compass.config.json', JSON.stringify(cfg))
  execFileSync(process.execPath, [BIN, 'sync', '--root', root])
  assert.doesNotMatch(read(root, 'docs/compass/protocol/start.md'), /No plan is configured/)
  assert.match(read(root, 'docs/compass/protocol/start.md'), /`PLAN.md`/)
  rmSync(root, { recursive: true })
})

test('init --ci writes the workflow and --hook installs the pre-commit hook', () => {
  const root = mkdtempSync(join(tmpdir(), 'compass-'))
  gitRepo(root)
  execFileSync(process.execPath, [BIN, 'init', '--root', root, '--tools', 'agents', '--ci', '--hook'])
  assert.match(read(root, '.github/workflows/compass.yml'), /compass\.mjs lint/)
  assert.match(read(root, '.git/hooks/pre-commit'), /compass/)
  rmSync(root, { recursive: true, force: true })
})

test('the hook routes npx and npm through node when npm sits next to it, then runs the lint command', () => {
  const script = hookScript('npx --yes github:EdwardBatt/Compass#v0.3.0 lint')
  assert.match(script, /\[ -f "\$d\/npx-cli\.js" \]/)
  assert.match(script, /npx\(\) \{ "\$n" "\$d\/npx-cli\.js" "\$@"; \}/)
  assert.match(script, /npm\(\) \{ "\$n" "\$d\/npm-cli\.js" "\$@"; \}/)
  assert.match(script, /\nnpx --yes github:EdwardBatt\/Compass#v0\.3\.0 lint \|\| /)
})

// On Windows, npx is a bash script, and GitHub Desktop's Git has no bash, so running it fails. A fake
// layout stands in: a broken npx on the PATH, and a node with npm's entry points beside it.
test('the hook runs npx through node in the Windows layout, and plain npx elsewhere', { skip: process.platform === 'win32' && 'needs a POSIX /bin/sh' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-hook-'))
  const log = join(dir, 'calls.log')
  const exe = (rel, body) => { write(dir, rel, `#!/bin/sh\n${body}\n`); chmodSync(join(dir, rel), 0o755) }
  exe('win/node', `echo "node $*" >> "${log}"`)
  write(dir, 'win/node_modules/npm/bin/npx-cli.js', '')
  write(dir, 'win/node_modules/npm/bin/npm-cli.js', '')
  exe('broken/npx', 'exit 99')
  exe('unix/node', 'exit 0')
  exe('unix/npx', `echo "npx $*" >> "${log}"`)
  write(dir, 'pre-commit', hookScript('npx --yes compass lint'))
  const run = (path) => execFileSync('/bin/sh', [join(dir, 'pre-commit')], { env: { PATH: `${path}:/usr/bin:/bin` }, stdio: 'pipe' })

  run(`${join(dir, 'win')}:${join(dir, 'broken')}`)
  assert.match(read(dir, 'calls.log'), /^node .*npx-cli\.js --yes compass lint$/m)

  run(join(dir, 'unix'))
  assert.match(read(dir, 'calls.log'), /^npx --yes compass lint$/m)

  write(dir, 'pre-commit', hookScript('npx false'))
  exe('unix/npx', 'exit 1')
  assert.throws(() => run(join(dir, 'unix')))
  rmSync(dir, { recursive: true, force: true })
})

test('a path that is neither a string nor false is a config error', () => {
  const root = project('agents')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  cfg.paths.adr = true
  write(root, 'compass.config.json', JSON.stringify(cfg))
  assert.ok(loadConfig(root).errors.some((e) => e.includes('paths.adr must be')))
  rmSync(root, { recursive: true })
})

test('init pins the version it ran; CI checks that version out and the lint command uses it', () => {
  const root = mkdtempSync(join(tmpdir(), 'compass-'))
  execFileSync(process.execPath, [BIN, 'init', '--root', root, '--owner', 'Sam', '--ci'])
  const version = JSON.parse(readFileSync(join(dirname(BIN), '..', 'package.json'), 'utf8')).version
  const { config } = loadConfig(root)
  assert.equal(config.pin, `v${version}`)
  assert.equal(config.lintCommand, `npx --yes github:EdwardBatt/Compass#v${version} lint`)
  assert.match(read(root, '.github/workflows/compass.yml'), new RegExp(`ref: v${version.replace(/\./g, '\.')}`))
  assert.match(read(root, 'AGENTS.md'), new RegExp(`Compass#v${version.replace(/\./g, '\.')} lint`))
  // An explicit lintCommand wins over the pin, and no pin means main.
  const raw = JSON.parse(read(root, 'compass.config.json'))
  write(root, 'compass.config.json', JSON.stringify({ ...raw, pin: '', lintCommand: 'npm run compass' }))
  const unpinned = loadConfig(root).config
  assert.equal(unpinned.lintCommand, 'npm run compass')
  sync(root, unpinned)
  assert.doesNotMatch(read(root, '.github/workflows/compass.yml'), /ref:/)
  write(root, 'compass.config.json', JSON.stringify({ ...raw, pin: 'v1; rm -rf /' }))
  assert.match(loadConfig(root).errors.join('\n'), /pin must be a Compass tag/)
  rmSync(root, { recursive: true })
})

test('the example store lints with no errors and its generated files are current', () => {
  const root = join(dirname(BIN), '..', 'examples', 'larder')
  const { config, errors: configErrors } = loadConfig(root)
  assert.deepEqual(configErrors, [])
  assert.deepEqual(check(root, config), [])
  const { errors, notes } = lint(root, config, { git: false })
  assert.deepEqual(errors, [])
  assert.ok(notes >= 6, `expected a full store, got ${notes} notes`)
})

/** A fresh team-mode project: several people, one repository. */
function teamProject(tools = 'claude,agents') {
  const root = mkdtempSync(join(tmpdir(), 'compass-'))
  execFileSync(process.execPath, [BIN, 'init', '--root', root, '--project', 'Demo', '--owner', 'Sam', '--tools', tools, '--team'])
  return root
}
const session = (extra = '') => `---\ntype: session\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\n${extra}sources: []\n---\n\n# Session\n`

test('team and approvers are validated', () => {
  const root = project('agents')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  write(root, 'compass.config.json', JSON.stringify({ ...cfg, team: 'yes', approvers: ['Alice', ''] }))
  const { errors } = loadConfig(root)
  assert.ok(errors.some((e) => e.includes('team must be true or false')))
  assert.ok(errors.some((e) => e.includes('approvers must be a list of names')))
  rmSync(root, { recursive: true })
})

test('in team mode a session note needs an author, and a date-only name is a warning', () => {
  const root = teamProject()
  write(root, 'docs/compass/sessions/2026-01-01.md', session())
  let { errors, warnings } = run(root)
  assert.ok(errors.some((e) => e.includes("needs 'author:' in team mode")))
  assert.ok(warnings.some((w) => w.includes('named by date alone')))
  rmSync(join(root, 'docs/compass/sessions/2026-01-01.md'))
  write(root, 'docs/compass/sessions/2026-01-01-alice-login.md', session('author: Alice\nbranch: feat/login\n'))
  ;({ errors, warnings } = run(root))
  assert.deepEqual(errors, [])
  assert.ok(!warnings.some((w) => w.includes('named by date alone')))
  // Solo projects keep the old rules: no author needed, a date is a fine name.
  const solo = project('agents')
  write(solo, 'docs/compass/sessions/2026-01-01.md', session())
  const s = run(solo)
  assert.deepEqual(s.errors, [])
  assert.ok(!s.warnings.some((w) => w.includes('named by date alone')))
  rmSync(root, { recursive: true })
  rmSync(solo, { recursive: true })
})

test('what a union merge leaves behind is an error: a doubled front-matter key or MAP row', () => {
  const root = project('agents')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace(/verified: (.*)/, 'verified: 2026-01-01\nverified: 2026-01-02'))
  const row = '| logging in | — | `compass.config.json` | — |'
  write(root, 'docs/compass/MAP.md', read(root, 'docs/compass/MAP.md').replace('|---|---|---|---|\n', `|---|---|---|---|\n${row}\n${row}\n`))
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.includes("'verified' more than once")))
  assert.ok(errors.some((e) => e.includes('appears twice')))
  rmSync(root, { recursive: true })
})

test("origin may name the person: human:<name>", () => {
  const root = project('agents')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace('origin: ai-derived', 'origin: human:Alice'))
  assert.deepEqual(run(root).errors, [])
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace('origin: human:Alice', 'origin: robot'))
  assert.ok(run(root).errors.some((e) => e.includes("got 'robot'")))
  rmSync(root, { recursive: true })
})

// ---------------------------------------------------------------------------------------------
// Team mode, against real git: branches, merges, --base, the shared hook, the report.
// ---------------------------------------------------------------------------------------------

/** A team project in a git repository on `main`, everything committed. Returns { root, git }. */
function teamRepo() {
  const root = teamProject()
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('symbolic-ref', 'HEAD', 'refs/heads/main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'Alice Example')
  git('config', 'core.autocrlf', 'false')
  write(root, 'src/a.js', 'a\n')
  write(root, 'src/b.js', 'b\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
  return { root, git }
}
const lintAt = (root, opts = {}) => {
  const { config } = loadConfig(root)
  return lint(root, config, opts)
}
test('lint --base: warnings only for what the branch changed, errors everywhere, and a note its source moved under', () => {
  const { root, git } = teamRepo()
  const old = (abstract, src, extra) =>
    `---\ntype: capsule\nstatus: current\norigin: ai-derived\nverified: 2020-01-01\nabstract: ${abstract}\n${extra}---\n\n# X\n\nPoints at \`${src}\`.\n`
  write(root, 'docs/compass/capsules/a.md', old('The A part.', 'src/a.js', 'owners: [alice, bob]\nsources:\n  - src/a.js\n'))
  write(root, 'docs/compass/capsules/b.md', old('The B part.', 'src/b.js', 'sources: [src/b.js]\n'))
  write(
    root,
    'docs/compass/MAP.md',
    read(root, 'docs/compass/MAP.md').replace(
      '|---|---|---|---|\n',
      '|---|---|---|---|\n| the a part | [capsules/a.md](capsules/a.md) — The A part. | `src/a.js` | — |\n| the b part | [capsules/b.md](capsules/b.md) — The B part. | `src/b.js` | — |\n',
    ),
  )
  git('add', '-A')
  git('commit', '-qm', 'capsules')

  // Unscoped, the whole project's ageing shows, with owners named.
  const full = lintAt(root)
  assert.deepEqual(full.errors, [])
  assert.ok(full.warnings.some((w) => w.startsWith('docs/compass/capsules/b.md') && w.includes('days ago')))
  assert.ok(full.warnings.some((w) => w.startsWith('docs/compass/capsules/a.md') && w.endsWith('(owners: alice, bob)')))

  git('checkout', '-qb', 'feature')
  write(root, 'src/a.js', 'a changed\n')
  git('commit', '-qam', 'change a')
  rmSync(join(root, 'src/b.js')) // uncommitted, and breaks capsule b, which the branch never touched
  const { errors, warnings, changed } = lintAt(root, { base: 'main' })
  assert.equal(changed, 2)
  assert.ok(errors.some((e) => e.includes("capsules/b.md: source 'src/b.js' does not exist")), 'errors are never scoped')
  assert.ok(!warnings.some((w) => w.includes('days ago')), 'the ageing of untouched notes is not this branch’s business')
  const left = warnings.find((w) => w.startsWith('docs/compass/capsules/a.md: this branch changes `src/a.js`'))
  assert.ok(left, warnings.join('\n'))
  assert.ok(left.endsWith('(owners: alice, bob)'))

  // Re-checking the note on the same branch answers the warning.
  write(root, 'src/b.js', 'b\n')
  write(root, 'docs/compass/capsules/a.md', read(root, 'docs/compass/capsules/a.md').replace('verified: 2020-01-01', 'verified: 2026-01-01'))
  const after = lintAt(root, { base: 'main' })
  assert.deepEqual(after.errors, [])
  assert.ok(!after.warnings.some((w) => w.includes('this branch changes')), after.warnings.join('\n'))

  assert.throws(() => lintAt(root, { base: 'no-such-ref' }), /cannot compare with 'no-such-ref'/)
  const cli = execFileSync(process.execPath, [BIN, 'lint', '--base', 'main'], { cwd: root, encoding: 'utf8' })
  assert.match(cli, /warnings scoped to the \d+ file\(s\) changed since main/)
  rmSync(root, { recursive: true, force: true })
})

test('sources written as a YAML list are read and checked', () => {
  const root = project('agents')
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace('sources: []', 'sources:\n  - src/gone.ts\n  - compass.config.json'))
  const { errors } = run(root)
  assert.ok(errors.some((e) => e.includes("source 'src/gone.ts' does not exist")))
  assert.ok(!errors.some((e) => e.includes("'compass.config.json' does not exist")))
  // An empty key is still an empty value, not a list.
  write(root, 'docs/compass/STATE.md', read(root, 'docs/compass/STATE.md').replace(/verified: .*/, 'verified:'))
  assert.ok(run(root).errors.some((e) => e.includes("missing 'verified'")))
  rmSync(root, { recursive: true })
})

test('in team mode the generated CI lints pull requests with --base; solo CI is unchanged', () => {
  const root = teamProject()
  write(root, 'compass.config.json', JSON.stringify({ ...JSON.parse(read(root, 'compass.config.json')), ci: true }))
  sync(root, loadConfig(root).config)
  const yml = read(root, '.github/workflows/compass.yml')
  assert.match(yml, /lint --base origin\/\$\{\{ github\.base_ref \}\}/)
  assert.match(yml, /github\.event_name != 'pull_request'/)
  const solo = project('agents')
  write(solo, 'compass.config.json', JSON.stringify({ ...JSON.parse(read(solo, 'compass.config.json')), ci: true }))
  sync(solo, loadConfig(solo).config)
  assert.doesNotMatch(read(solo, '.github/workflows/compass.yml'), /--base/)
  rmSync(root, { recursive: true })
  rmSync(solo, { recursive: true })
})

test('compass hook in team mode points core.hooksPath at the committed hook, and never clobbers another', () => {
  const { root, git } = teamRepo()
  const hook = () => execFileSync(process.execPath, [BIN, 'hook'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  // A hook of the project's own in .git/hooks would silently stop running: refuse.
  const own = join(root, git('rev-parse', '--git-common-dir'), 'hooks')
  mkdirSync(own, { recursive: true })
  writeFileSync(join(own, 'pre-push'), '#!/bin/sh\nexit 0\n')
  assert.throws(hook, /pre-push/)
  rmSync(join(own, 'pre-push'))

  assert.match(hook(), /core\.hooksPath/)
  assert.equal(git('config', 'core.hooksPath'), '.githooks')
  assert.match(execFileSync(process.execPath, [BIN, 'doctor'], { cwd: root, encoding: 'utf8' }), /hook {4}installed — core\.hooksPath is \.githooks/)
  assert.match(hook(), /core\.hooksPath/) // idempotent

  git('config', 'core.hooksPath', '.husky')
  assert.throws(hook, /already '\.husky'/)

  // A CRLF checkout of the hook would break it on every machine that runs it.
  write(root, '.githooks/pre-commit', read(root, '.githooks/pre-commit').replace(/\n/g, '\r\n'))
  assert.ok(run(root).errors.some((e) => e.includes('.githooks/pre-commit') && e.includes('CRLF')))
  sync(root, loadConfig(root).config)
  assert.doesNotMatch(read(root, '.githooks/pre-commit'), /\r/)
  rmSync(root, { recursive: true, force: true })
})

test('compass report: unrouted tasks, misses, capsule use, in-flight work by person, stale notes by owner', () => {
  const { root } = teamRepo()
  const note = (author, branch, body) =>
    `---\ntype: session\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\nauthor: ${author}\nbranch: ${branch}\nsources: []\n---\n\n# Session\n\n${body}\n`
  const traj = (date, task, cap, missed) => '```text\n' + `trajectory: ${date} — ${task}\n  capsule: ${cap}\n  source:  src/a.js\n  missed:  ${missed}\n` + '```'
  write(root, 'docs/compass/capsules/a.md', capsule('The A part.').replace('verified: 2026-01-01', 'verified: 2020-01-01').replace('sources: []', 'owners: [alice]\nsources: []'))
  write(root, 'docs/compass/capsules/b.md', capsule('The B part.'))
  write(root, 'docs/compass/sessions/2026-01-01-alice-login.md', note('Alice Example', 'main', '**In flight** — the login form is half wired\n\n' + traj('2026-01-01', 'add login', 'none — no row in MAP.md matched', 'src/b.js — the session store')))
  write(
    root,
    'docs/compass/sessions/2026-01-02-bob-export.md',
    note('Bob', 'feat/export', '**In flight** — ~~csv header~~ done in abc123\n\n**Unresolved** — waiting on Alice for the column order\n\n' + traj('2026-01-02', 'export csv', 'capsules/a.md', 'src/b.js — the session store again')),
  )
  write(root, 'docs/compass/archive/2025-12-01-carol-old.md', note('Carol', 'old', traj('2025-12-01', 'old thing', 'capsules/a.md', '—')))

  const { config } = loadConfig(root)
  const r = report(root, config, { today: new Date(2026, 0, 10) })
  assert.equal(r.sessions, 3)
  assert.equal(r.archived, 1)
  assert.equal(r.trajectories, 3)
  assert.deepEqual(r.unrouted.map((t) => t.task), ['add login'])
  assert.deepEqual(r.missedCounts[0], { what: 'src/b.js', count: 2 })
  assert.deepEqual(r.capsuleLoads, [{ capsule: 'capsules/a.md', count: 2 }])
  assert.deepEqual(r.neverLoaded, ['capsules/b.md'])
  const alice = r.inFlight.find((s) => s.author === 'Alice Example')
  assert.deepEqual(alice.inFlight, ['the login form is half wired'])
  assert.equal(alice.branchState, 'current')
  const bob = r.inFlight.find((s) => s.author === 'Bob')
  assert.deepEqual(bob.inFlight, [], 'a struck line is done')
  assert.deepEqual(bob.unresolved, ['waiting on Alice for the column order'])
  assert.equal(bob.branchState, 'gone')
  assert.deepEqual(r.stale.map((s) => [s.path, s.owners]), [['docs/compass/capsules/a.md', ['alice']]])

  const text = format(r, config)
  assert.match(text, /Tasks the map could not route \(1\)/)
  assert.match(text, /2× {2}src\/b\.js/)
  assert.match(text, /Bob on feat\/export: .*branch gone/)
  assert.match(text, /0× {2}capsules\/b\.md — never loaded/)
  const json = JSON.parse(execFileSync(process.execPath, [BIN, 'report', '--json'], { cwd: root, encoding: 'utf8' }))
  assert.equal(json.trajectories, 3)
  rmSync(root, { recursive: true, force: true })
})

test('compass report on the example store', () => {
  const root = join(dirname(BIN), '..', 'examples', 'larder')
  const { config } = loadConfig(root)
  const r = report(root, config, { git: false })
  assert.equal(r.trajectories, 1)
  assert.match(r.missed[0].missed, /^PLAN\.md/)
  assert.match(format(r, config), /Open in session notes/)
})

// ---------------------------------------------------------------------------------------------
// Team layout: no two branches edit the same lines. Forges ignore merge=union, so these merges run
// with plain git and no merge driver at all — the same result a pull request merge would give.
// ---------------------------------------------------------------------------------------------

const stateItem = (title, state, extra = '') =>
  `---\ntype: state\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\nstate: ${state}\n${extra}sources: []\n---\n\n# ${title}\n\nWhat is true about it.\n`
const trapFile = (symptom) => `---\ntype: trap\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\nsources: []\n---\n\n# ${symptom}\n\nCost an hour.\n`
const logHeader = (who) => `---\ntype: log\nstatus: current\norigin: ai-derived\nverified: 2026-01-01\nsources: []\n---\n\n# Trajectories — ${who}\n\n`
const logLine = (date, task, cap, missed, by) => `- trajectory: ${date} — ${task} | by: ${by} | capsule: ${cap} | adrs: — | source: src/a.js | missed: ${missed}\n`
const appendTo = (root, rel, text) => write(root, rel, (existsSync(join(root, rel)) ? read(root, rel) : '') + text)
/** Puts a MAP row in alphabetical place, as close is told to. */
function addRow(root, task, src) {
  const map = read(root, 'docs/compass/MAP.md')
  const head = '|---|---|---|---|\n'
  const i = map.indexOf(head) + head.length
  const end = map.indexOf('\n\n', i)
  const rows = map.slice(i, end).split('\n').filter(Boolean)
  rows.push(`| ${task} | — | \`${src}\` | — |`)
  rows.sort((a, b) => a.localeCompare(b))
  write(root, 'docs/compass/MAP.md', map.slice(0, i) + rows.join('\n') + map.slice(end))
}

test('solo output says nothing about teams; a team store keeps what several people add to as folders', () => {
  const solo = project('claude')
  for (const f of ['docs/compass/protocol/start.md', 'docs/compass/protocol/close.md', 'docs/compass/README.md']) {
    assert.doesNotMatch(read(solo, f), /teammate|person you are working with|human:<name>|state\//, f)
  }
  assert.match(read(solo, 'docs/compass/STATE.md'), /## In flight right now/)
  assert.ok(!existsSync(join(solo, 'docs/compass/state')))
  assert.ok(!existsSync(join(solo, '.gitattributes')))

  const root = teamProject('claude,agents,cursor')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  assert.equal(cfg.team, true)
  assert.deepEqual(cfg.approvers, ['Sam'])
  assert.deepEqual(run(root).errors, [])
  for (const gone of ['docs/compass/STATE.md', 'docs/compass/traps.md']) assert.ok(!existsSync(join(root, gone)), gone)
  for (const dir of ['state', 'traps', 'trajectories']) assert.ok(existsSync(join(root, 'docs/compass', dir, '.gitkeep')), dir)

  const start = read(root, '.claude/commands/compass-start.md')
  assert.match(start, /git config user\.name/)
  assert.match(start, /so nobody picks up work someone else already has/)
  assert.match(start, /search `docs\/compass\/state\/` for its `state:` lines/)
  assert.match(start, /list `docs\/compass\/traps\/` — \*\*each file is named as its symptom\*\*/)
  assert.doesNotMatch(start, /STATE\.md|traps\.md/)
  const close = read(root, 'docs/compass/protocol/close.md')
  assert.match(close, /it goes to Sam to accept or reject, in review/)
  assert.match(close, /\*\*Each item is its own file, `state\/<item>\.md`\*\*/)
  assert.match(close, /There is no index to update/)
  assert.match(close, /Keep the rows in alphabetical order/)
  assert.match(close, /trajectories\/<who>\.md/)
  assert.doesNotMatch(close, /STATE\.md|traps\.md|trajectories\.md/)
  for (const f of ['CLAUDE.md', 'AGENTS.md', '.cursor/rules/compass.mdc', 'docs/compass/README.md']) assert.doesNotMatch(read(root, f), /STATE\.md|traps\.md/, f)
  // Nothing relies on a merge driver: forges ignore them when merging a pull request.
  assert.equal(read(root, '.gitattributes'), '# compass:begin — generated from compass.config.json; edit that, then run `compass sync`\n.githooks/pre-commit text eol=lf\n# compass:end\n')
  assert.match(read(root, '.githooks/pre-commit'), /^#!\/bin\/sh\n[\s\S]* lint \|\|/)
  rmSync(solo, { recursive: true })
  rmSync(root, { recursive: true })
})

test('approvers are named in team mode, and a hand-edited .gitattributes block is drift', () => {
  const root = teamProject()
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  write(root, 'compass.config.json', JSON.stringify({ ...cfg, approvers: ['Alice', 'Bob', 'Sam'] }))
  write(root, '.gitattributes', '*.png binary\n\n' + read(root, '.gitattributes'))
  const { config } = loadConfig(root)
  sync(root, config)
  assert.match(read(root, 'docs/compass/protocol/close.md'), /it goes to Alice, Bob and Sam to accept or reject/)
  assert.match(read(root, '.gitattributes'), /^\*\.png binary\n/)
  assert.deepEqual(sync(root, config), [])
  write(root, '.gitattributes', read(root, '.gitattributes').replace('text eol=lf', '-text'))
  assert.ok(run(root).errors.some((e) => e.startsWith('.gitattributes')))
  rmSync(root, { recursive: true })
})

test('two teammates each add a state item, a trap, a trajectory and a MAP row in parallel: plain git merges it all', () => {
  const { root, git } = teamRepo()
  for (const t of ['adding tasks', 'listing tasks', 'saving to disk']) addRow(root, t, 'src/a.js')
  git('add', '-A')
  git('commit', '-qm', 'map')

  git('checkout', '-qb', 'alice')
  write(root, 'docs/compass/state/due-dates.md', stateItem('Due dates', 'working'))
  write(root, 'docs/compass/traps/login-hangs.md', trapFile('Login hangs'))
  appendTo(root, 'docs/compass/trajectories/alice.md', logHeader('Alice') + logLine('2026-01-01', 'due dates', 'none', 'src/b.js — the store', 'Alice'))
  addRow(root, 'exporting csv', 'src/b.js') // lands between "adding" and "listing"
  git('add', '-A')
  git('commit', '-qm', 'alice')

  git('checkout', '-q', 'main')
  git('checkout', '-qb', 'bob')
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'partial'))
  write(root, 'docs/compass/traps/export-is-empty.md', trapFile('Export is empty'))
  appendTo(root, 'docs/compass/trajectories/bob.md', logHeader('Bob') + logLine('2026-01-02', 'tags', 'capsules/a.md', 'src/b.js — again', 'Bob'))
  addRow(root, 'tagging tasks', 'src/a.js') // lands after "saving"
  git('add', '-A')
  git('commit', '-qm', 'bob')

  git('checkout', '-q', 'main')
  git('merge', '-q', '--no-edit', 'alice')
  git('merge', '-q', '--no-edit', 'bob') // throws on any conflict
  assert.deepEqual(lintAt(root, { git: false }).errors, [])
  const rows = read(root, 'docs/compass/MAP.md').match(/^\| [a-z][^|]*\|/gm).map((r) => r.slice(2, -2).trim())
  assert.deepEqual(rows, ['adding tasks', 'exporting csv', 'listing tasks', 'saving to disk', 'tagging tasks'])
  const { config } = loadConfig(root)
  const r = report(root, config, { git: false })
  assert.equal(r.logs, 2)
  assert.deepEqual(r.trajectories, 2)
  assert.deepEqual(r.missedCounts[0], { what: 'src/b.js', count: 2 })
  rmSync(root, { recursive: true, force: true })
})

test('what still conflicts is a real disagreement: one state item changed two ways, or two MAP rows in one place', () => {
  const { root, git } = teamRepo()
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'partial'))
  git('add', '-A')
  git('commit', '-qm', 'tags')
  git('checkout', '-qb', 'alice')
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'working'))
  addRow(root, 'adding tasks', 'src/a.js')
  git('commit', '-qam', 'alice')
  git('checkout', '-q', 'main')
  git('checkout', '-qb', 'bob')
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'broken'))
  addRow(root, 'archiving tasks', 'src/a.js')
  git('commit', '-qam', 'bob')
  git('checkout', '-q', 'main')
  git('merge', '-q', '--no-edit', 'alice')
  let conflict = ''
  try {
    git('merge', '-q', '--no-edit', 'bob')
  } catch {
    conflict = git('diff', '--name-only', '--diff-filter=U')
  }
  assert.match(conflict, /docs\/compass\/state\/tags\.md/, 'one item, two answers: a person decides')
  assert.match(conflict, /docs\/compass\/MAP\.md/, 'two rows in the same alphabetical gap still touch')
  git('merge', '--abort')
  rmSync(root, { recursive: true, force: true })
})

test('the lint holds the team folders to their shape', () => {
  const root = teamProject()
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'done'))
  write(root, 'docs/compass/state/flag.md', stateItem('The --tag flag', 'waiting'))
  write(root, 'docs/compass/state/tags-again.md', stateItem('Tags', 'working'))
  write(root, 'docs/compass/state/wrong.md', stateItem('Wrong', 'working').replace('type: state', 'type: trap'))
  write(root, 'docs/compass/traps/misnamed.md', trapFile('Login hangs'))
  write(root, 'docs/compass/traps/export-is-empty.md', trapFile('Export is empty').replace('type: trap', 'type: state'))
  write(root, 'docs/compass/trajectories/alice.md', logHeader('Alice').replace('type: log', 'type: map'))
  const { errors } = run(root)
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `${re}\n${errors.join('\n')}`)
  has(/state\/tags\.md: 'state:' must be one of working, partial, absent, broken, waiting \(got 'done'\)/)
  has(/state\/flag\.md: state: waiting needs 'waiting_on:'/)
  has(/state\/tags(-again)?\.md: describes 'Tags', and so does .*state\/tags(-again)?\.md/)
  has(/state\/wrong\.md: a file in state\/ must have type: state/)
  has(/traps\/misnamed\.md: named 'misnamed\.md', but its heading makes it 'login-hangs\.md'/)
  has(/traps\/export-is-empty\.md: a file in traps\/ must have type: trap/)
  has(/trajectories\/alice\.md: a file in trajectories\/ must have type: log/)
  rmSync(root, { recursive: true })
})

test('the state folder is checked against the plan, and the report lists who is being waited on', () => {
  const { root, git } = teamRepo()
  write(root, 'PLAN.md', '# Plan\n\n- [ ] tags\n')
  const cfg = JSON.parse(read(root, 'compass.config.json'))
  write(root, 'compass.config.json', JSON.stringify({ ...cfg, paths: { ...cfg.paths, plan: 'PLAN.md' } }, null, 2))
  sync(root, loadConfig(root).config)
  write(root, 'docs/compass/state/tags.md', stateItem('Tags', 'partial').replace('verified: 2026-01-01', 'verified: 2020-01-01'))
  write(root, 'docs/compass/state/tag-flag.md', stateItem('The --tag flag', 'waiting', 'waiting_on: Alice\n'))
  git('add', '-A')
  git('commit', '-qm', 'plan and state')
  const { warnings } = lintAt(root)
  assert.ok(warnings.some((w) => w.startsWith('docs/compass/state/: the plan (`PLAN.md`) changed on')), warnings.join('\n'))
  const { config } = loadConfig(root)
  const r = report(root, config, { git: false })
  assert.deepEqual(r.waiting, [{ path: 'docs/compass/state/tag-flag.md', item: 'The --tag flag', on: 'Alice' }])
  assert.match(format(r, config), /Waiting on a person\n {2}Alice: The --tag flag/)
  rmSync(root, { recursive: true, force: true })
})

test('trajectory logs: one per person, never checked for paths, archived when large, read once per entry', () => {
  const root = teamProject()
  const solo = project('agents')
  assert.ok(!existsSync(join(solo, 'docs/compass/trajectories')))
  assert.doesNotMatch(read(solo, 'docs/compass/protocol/close.md'), /trajectories|6b\./)
  const close = read(root, 'docs/compass/protocol/close.md')
  assert.match(close, /every session, even one that changes nothing else/)
  assert.match(close, /Append to the end without reading the file/)
  assert.match(read(root, 'docs/compass/protocol/start.md'), / {2}by: {6}<git config user\.name>/)

  // History may name files that are gone since: a log entry's paths and links are not checked.
  write(root, 'docs/compass/trajectories/alice.md', logHeader('Alice') + logLine('2026-01-01', 'gone', 'capsules/gone.md', '`src/deleted.js` — and [x](nowhere.md)', 'Alice'))
  assert.deepEqual(run(root).errors, [])
  assert.ok(!run(root).warnings.some((w) => w.includes('deleted.js')))

  // An archived log still counts; a session note repeating an entry is not counted twice.
  write(root, 'docs/compass/archive/trajectories-alice-2025.md', logHeader('Alice') + logLine('2025-06-01', 'old task', 'none', '—', 'Alice'))
  const block = '```text\ntrajectory: 2026-01-01 — gone\n  capsule: capsules/gone.md\n  missed:  x\n```\n'
  write(root, 'docs/compass/sessions/2026-01-01-alice-gone.md', session('author: Alice\nbranch: main\n') + '\n' + block)
  const { config } = loadConfig(root)
  const r = report(root, config, { git: false })
  assert.equal(r.logs, 2)
  assert.equal(r.trajectories, 2)
  assert.deepEqual(r.unrouted.map((t) => t.task), ['old task'])

  let big = logHeader('Bob')
  for (let i = 0; big.length < 12500; i++) big += logLine('2026-01-01', `task ${i}`, 'capsules/a.md', '—', 'Bob')
  write(root, 'docs/compass/trajectories/bob.md', big)
  assert.ok(run(root).warnings.some((w) => w.startsWith('docs/compass/trajectories/bob.md') && w.includes('move it to archive/')))
  rmSync(root, { recursive: true })
  rmSync(solo, { recursive: true })
})
