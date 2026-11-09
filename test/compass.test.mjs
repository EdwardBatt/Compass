import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadConfig, findRoot } from '../src/config.mjs'
import { lint, slug } from '../src/lint.mjs'
import { sync, check } from '../src/sync.mjs'
import { render } from '../src/render.mjs'

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
