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
