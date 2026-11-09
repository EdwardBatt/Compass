# Compass

Shared, agent-independent orientation for AI coding tools. Compass is a small Markdown store in your repository that routes a task to the right context, plus a lint that catches when that store has rotted. Claude Code, Cursor, Gemini, Antigravity and anything that reads `AGENTS.md` all use the same store.

No database, no plugin, no dependencies: Node 18.17+ and git.

## Quick start

```bash
npx --yes github:EdwardBatt/Compass init --project "My App" --owner "Sam" --tools claude,cursor,gemini,antigravity,agents
```

This creates:

- `compass.config.json` — yours; everything project-specific lives here
- `docs/compass/` — the store: `README.md`, `MAP.md`, `STATE.md`, `traps.md`, `capsules/`, `sessions/`, `archive/`
- `docs/compass/protocol/start.md` and `close.md` — the procedures (generated)
- one pointer per tool: a `compass:begin … compass:end` block in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the Antigravity rules, `.cursor/rules/compass.mdc`, and `/compass-start` and `/compass-close` for Claude Code (generated)

Then fill in `paths` in the config, run `compass sync`, and write the store README's first paragraph.

## Daily use

The CLI sets Compass up. Day to day, two routines do the work, one at each end of a session.

| When | Claude Code | Other tools | What happens |
|---|---|---|---|
| Before work | `/compass-start <task>` | follow `docs/compass/protocol/start.md` | Reads the map, one capsule and the source it names, then reports what it loaded, the decisions and traps that apply, and anything waiting on a person. Ends with a trajectory block recording the context it was given |
| Not sure what to do next | `/compass-start` (no task) | same file, no task | Proposes a short, ranked list from STATE, the newest session note, git and the plan. Then waits for you to pick |
| After work | `/compass-close` | follow `docs/compass/protocol/close.md` | Writes back only what is durable: a trap, a state change, a capsule edit or a missing map row. Drafts decision records instead of putting decisions in notes. Runs the lint. **Most sessions write nothing** |
| Before every commit | `compass lint` (or your `lintCommand`) | same | Fails on anything provably wrong in the store |

Cursor, Gemini, Antigravity and `AGENTS.md` readers are pointed at the two protocol files by their generated rules, so you can just ask them to "start Compass for <task>" or "close Compass".

## Commands

| Command | Does |
|---|---|
| `compass init` | Writes the config and store if they are missing, then syncs |
| `compass sync` | Regenerates every tool's files from the config. `--check` only reports drift |
| `compass lint` | Rot detection. Exits 1 on any error |
| `compass doctor` | Shows the root, config, every generated file's status, hook and CI |
| `compass hook` | Installs a git pre-commit hook that runs the lint |

All of them accept `--root <dir>`. Otherwise the root is the nearest folder holding `compass.config.json`, or else the git top level, so they work from any subfolder.

## The store

| Tier | File | Read |
|---|---|---|
| 0 | `README.md` | every session |
| 1 | `MAP.md` | every session — spoken task → one capsule → source files |
| 1 | `STATE.md` | when the task depends on what is built |
| 1 | `traps.md` | its index, before debugging; then only matching entries |
| 2 | `capsules/<one>.md` | the one the map names, ≤ 60 lines |
| 3 | the source | always, last, and it wins |

Decisions, rules, schemas and plans never go in the store. It points at them.

## What the lint checks

**Errors** (provably wrong now):

- front matter, with a valid `type`, `status`, `origin` and `verified`
- dead links and dead `#anchors`
- backticked paths in `MAP.md` and capsules that do not exist, read from the project root
- `sources:` entries that do not exist
- a capsule over its line cap, or with a bad abstract
- a `MAP.md` abstract that does not match its capsule
- a trap missing from the index, a stale index line or a wrong anchor
- a future `verified:` date
- a generated file or block that differs from `compass sync` output
- config paths that do not exist

**Warnings** (for a human to judge):

- a note unverified for too long
- a source changed in git after `verified:`
- MAP, STATE or one MAP row over its size cap
- an unrouted capsule
- an unpromoted session note
- short paths outside MAP and capsules

Fenced code is never linted.

## Configuration

```jsonc
{
  "version": 1,
  "project": "My App",
  "owner": "Sam",
  "ownerCommits": true,            // the close routine ends with "do not commit"
  "store": "docs/compass",
  "tools": ["claude", "cursor", "gemini", "antigravity", "agents"],
  "lintCommand": "npm run compass", // what agents are told to run
  "ci": true,                       // also generate .github/workflows/compass.yml
  "paths": { "plan": "…", "roadmap": "…", "adr": "…", "schema": "…", "rules": ["CLAUDE.md"] },
  "authority": [],                  // Markdown lines, highest first; empty = derived from paths
  "state": { "inFlight": "In flight right now", "waiting": "Waiting on Sam" },
  "pointerNote": "",                // one extra project-specific line in every pointer
  "targets": { "gemini": ".gemini/GEMINI.md" },  // override where a tool's file lives
  "caps": { "capsuleLines": 60, "mapRowChars": 1200, "fileChars": { "MAP.md": 12000 } },
  "ignorePaths": []                 // backticked path prefixes the lint must not resolve
}
```

Defaults are in `src/config.mjs`.

## CI

`compass sync` with `"ci": true` writes `.github/workflows/compass.yml`, which runs the lint on every push and pull request. It needs no secrets.

To pin a version, use `github:EdwardBatt/Compass#v0.1.0` in your `lintCommand`. Without a tag, `npx` runs the latest commit on `main`.

## Developing

```bash
npm test     # node:test, no dependencies
```

## Licence

[Mozilla Public License 2.0](LICENSE). You can use Compass in any project, commercial or closed-source, and your own files stay yours. If you distribute a modified version of Compass's own files, those changes must be shared under the MPL too.

**Exception for generated files.** Files that `compass init` and `compass sync` generate in your project, and the notes you write in your Compass store, are yours to use, change and distribute under any terms you choose. The MPL does not apply to them. It applies only to Compass itself.
