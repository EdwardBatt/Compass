# Compass

**Shared project memory for AI coding agents, with a lint that keeps it honest.**

AI coding agents start every session knowing nothing about your project. They either read too much (slow, expensive, distracted) or too little (confident and wrong). Notes written to help them go stale silently, and each tool keeps its own copy of the rules.

Compass fixes that with three things:

1. **A tiered Markdown store in your repository** that sends each task to *one* short note and the source files that matter, instead of the whole codebase.
2. **Two routines**, *start* and *close*, that every agent follows: orient before work, and write back only what will still be true next quarter.
3. **A lint that treats memory rot as a build failure**: dead paths, notes that have grown into copies of the code, a plan that moved while the status file didn't, generated rules edited by hand.

One `compass.config.json` generates the instructions for **Claude Code, Cursor, Gemini, Antigravity and anything that reads `AGENTS.md`**, so every tool works from the same memory.

No database, no plugin, no dependencies: Node 18.17+ and git.

```
 task ──► MAP.md ──► one capsule ──► the source files ──► work ──► close ──► lint
            │            (≤ 60 lines)        (they win)               │
            └── STATE.md · traps.md index ◄────────── only what is durable
```

## Quick start

You need Node 18.17 or later and a git repository (run `git init` first in a new folder; the staleness checks and the hook read git). Then, in the repository:

```bash
npx --yes github:EdwardBatt/Compass#v0.3.0 init --tools claude,cursor,gemini,antigravity,agents --ci --hook
```

`init`:

- writes `compass.config.json`. It takes the owner from `git config user.name`, pins the Compass version it ran, and pre-fills `paths` with any plan, roadmap, decision-record folder or schema it finds under common names;
- creates the store in `docs/compass/`;
- generates every tool's instructions;
- with `--ci`, adds a GitHub Actions workflow; with `--hook`, adds a pre-commit hook;
- ends with numbered next steps.

Add `--project "Name"` and `--owner "Name"` to override what it guesses. List only the tools you use; `agents` covers any tool that reads `AGENTS.md`.

## See it filled in

[`examples/larder`](examples/larder) is a small, made-up app with a store as it looks after a few weeks of work. It lints clean, and the test suite keeps it that way. Read these to see what good looks like:

| File | Shows |
|---|---|
| [`MAP.md`](examples/larder/docs/compass/MAP.md) | rows worded as people speak, each routing to one capsule and the source |
| [`capsules/shopping-list.md`](examples/larder/docs/compass/capsules/shopping-list.md) | a capsule that points at source, says what deliberately does not work, and marks inference |
| [`STATE.md`](examples/larder/docs/compass/STATE.md) | what actually runs, including where the plan overstates it |
| [`traps.md`](examples/larder/docs/compass/traps.md) | entries worded as symptoms, each with its cost and the test that now catches it |
| [`sessions/2026-11-09.md`](examples/larder/docs/compass/sessions/2026-11-09.md) | the rare session note, with a trajectory whose `missed:` led to a new MAP row |
| [`compass.config.json`](examples/larder/compass.config.json) | a pinned config with a plan, decision records, a schema and a rules file |

## Adopting in an existing project

Do not try to document the codebase on day one. A store written up front is a guess about what agents will need, and most of it will never be read.

1. Run `init`, write the README paragraph, and check the `paths` it filled in.
2. Seed `traps.md` with the two or three failures everyone on the team already knows about: the ones a newcomer always hits.
3. If the plan overstates what is built, say so in `STATE.md`. That alone stops agents building on features that do not exist.
4. Then work normally. Each task the map cannot route is recorded as `missed:`, and close adds the row. After a few weeks, the map covers the areas people actually work in, and nothing else.

## Your first week

| When | What you do | What Compass does |
|---|---|---|
| **Day 0** | Run `init`. Replace the placeholder paragraph in `docs/compass/README.md` with three or four sentences about the project | The lint warns until the placeholder is gone |
| **Day 1** | Write a plan: a short list of milestones in any Markdown file. Set `paths.plan` (the lint suggests it if the file has a common name) and run `compass sync` | `/compass-start` with no task now proposes work from the plan. Until then, it explains that no plan is configured and what to do first |
| **First task** | `/compass-start add login` | The map is empty, so it reports *no row matched* and records that in its trajectory block. Compass is designed to fill itself from the tasks it could not route |
| **End of that session** | `/compass-close` | Adds a MAP row for login, moves login into STATE's *Working* section, ticks the plan. Adds a trap only if something cost real time and its cause was hidden |
| **First real decision** | — | Close drafts a decision record and stops for you to accept it. When the folder exists, the lint suggests setting `paths.adr`. After `sync`, every procedure checks decisions |
| **A domain gets complicated** | — | Close writes the first capsule: at most 60 lines, pointing at source rather than copying it. MAP routes to it with a one-sentence abstract the lint keeps identical |
| **Every commit** | — | The hook and CI fail on anything provably wrong. Warnings flag what is merely aging |

Most sessions write nothing. That is the intended outcome: a store that fills with notes nobody needed is the failure Compass exists to prevent.

## Daily use

The CLI sets Compass up. Day to day, two routines do the work, one at each end of a session.

| When | Claude Code | Other tools | What happens |
|---|---|---|---|
| Before work | `/compass-start <task>` | follow `docs/compass/protocol/start.md` | Reads the map, one capsule and the source it names, then reports what it loaded, the decisions and traps that apply, and anything waiting on a person. Ends with a trajectory block recording the context it was given |
| Not sure what to do next | `/compass-start` (no task) | same file, no task | Proposes a short, ranked list from STATE, the newest session note, git and the plan, then waits for you to pick. On an empty project, says what to do first |
| After work | `/compass-close` | follow `docs/compass/protocol/close.md` | Writes back only what is durable: a trap, a state change, a capsule edit, a missing map row, a new path in the config. Drafts decision records instead of putting decisions in notes. Runs the lint. **Most sessions write nothing** |
| Before every commit | `compass lint` (or your `lintCommand`) | same | Fails on anything provably wrong in the store |

Cursor, Gemini, Antigravity and `AGENTS.md` readers are pointed at the two protocol files by their generated rules, so you can ask them to "start Compass for <task>" or "close Compass".

## The store

| Tier | File | Read |
|---|---|---|
| 0 | `README.md` | every session: what the project is, and the rules of the store |
| 1 | `MAP.md` | every session: the words someone would say → one capsule → source files |
| 1 | `STATE.md` | when the task depends on what is built, broken, or waiting on a person |
| 1 | `traps.md` | before debugging: its index (worded as symptoms), then only the matching entries. Each entry is a `###` heading |
| 2 | `capsules/<one>.md` | only the one the map names; ≤ 60 lines; points at source |
| 3 | the source | always, last, and it wins |

`sessions/` holds the rare hand-over note; `archive/` holds what has been promoted or retired. `protocol/` is generated.

**What never goes in the store:** decisions (decision records), rules (your rules files), schemas and contracts (the code), plans and task lists (your plan). The store *points* at them. A copy is a second source of truth that will drift.

**Every note carries** `type`, `status`, `origin` (`human` or `ai-derived`; an agent never rewrites a human's line) and `verified`, the date it was last checked against real code.

## What the lint checks

**Errors** — provably wrong right now; exit 1:

- front matter missing, or with an invalid `type`, `status`, `origin` or `verified`
- a dead link or a dead `#anchor`
- a backticked path in `MAP.md` or a capsule that does not exist, read from the project root
- a `sources:` entry that does not exist
- a capsule over its line cap, or an abstract that is missing, too long, or more than one sentence
- a `MAP.md` abstract that differs from its capsule's own
- a trap missing from the index, an index line with no entry, or a wrong anchor
- a `verified:` date in the future
- a generated file or block that differs from `compass sync` output
- a config path that does not exist

**Warnings** — judgement calls for a human:

- the configured plan or roadmap changed in git after `STATE.md` was verified
- a note's source changed in git after the note was verified (session notes excepted: they are snapshots)
- a note unverified for longer than `staleDays`
- a session note older than `promoteDays`: promote what is durable, then archive it
- `MAP.md`, `STATE.md`, the README, one MAP row or the traps index over its size cap
- a capsule that MAP never routes to
- a short path outside MAP and capsules
- a placeholder left by `init`
- a plan, roadmap, decision folder or schema found on disk that the config does not name yet

Fenced code is never linted. Every path is resolved from the project root, so the lint gives the same answer from any subfolder.

## Commands

| Command | Does |
|---|---|
| `compass init` | Writes the config (owner from git, paths discovered) and the store if they are missing, then syncs. `--ci`, `--hook`, `--tools`, `--project`, `--owner` |
| `compass sync` | Regenerates every tool's files from the config. `--check` only reports drift |
| `compass lint` | Rot detection. Exits 1 on any error |
| `compass doctor` | Shows the root, config, every generated file's status, every configured path, hints, hook, CI and the pinned version |
| `compass hook` | Installs a git pre-commit hook that runs the lint |
| `compass version` | Prints the version |

All of them accept `--root <dir>`. Otherwise the root is the nearest folder holding `compass.config.json`, or else the git top level.

## Configuration

```jsonc
{
  "version": 1,
  "project": "My App",
  "owner": "Sam",
  "ownerCommits": true,            // close ends with "do not commit; Sam does"
  "store": "docs/compass",
  "tools": ["claude", "cursor", "gemini", "antigravity", "agents"],
  "pin": "v0.3.0",                  // the Compass version CI runs; '' = latest on main
  "lintCommand": "npm run compass", // what agents are told to run; unset = npx at the pinned version
  "ci": true,                       // also generate .github/workflows/compass.yml
  "paths": {
    "plan": "PLAN.md",              // '' = not set yet (the lint suggests candidates)
    "roadmap": false,               // false = this project has none (no suggestions)
    "adr": "docs/adr/",
    "schema": "prisma/schema.prisma",
    "rules": ["CONTRIBUTING.md"]
  },
  "authority": [],                  // Markdown lines, highest first; empty = derived from paths
  "state": { "inFlight": "In flight right now", "waiting": "Waiting on Sam" },
  "pointerNote": "",                // one extra project-specific line in every tool's pointer
  "targets": { "gemini": ".gemini/GEMINI.md" },  // where each tool's file lives
  "caps": { "capsuleLines": 60, "mapRowChars": 1200, "fileChars": { "MAP.md": 12000 } },
  "ignorePaths": []                 // backticked path prefixes the lint must not resolve
}
```

Compass acts only on what the config says. Paths it discovers are suggestions you confirm, never behaviour. Defaults are in [`src/config.mjs`](src/config.mjs).

### What is generated, and what is yours

| Generated by `compass sync` — never edit | Yours |
|---|---|
| `docs/compass/protocol/start.md`, `close.md` | `compass.config.json` |
| `.claude/commands/compass-start.md`, `compass-close.md` | every note in `docs/compass/` |
| `.cursor/rules/compass.mdc` | everything outside the `compass:begin` / `compass:end` markers |
| the block between `compass:begin` and `compass:end` in the store README, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` and the Antigravity rules | |
| `.github/workflows/compass.yml` (when `ci` is on) | |

To change a procedure, change the config, or change Compass and run `sync` in each project. The lint fails on hand edits, so the copies for different tools can never drift apart.

## CI

`compass sync` with `"ci": true` writes `.github/workflows/compass.yml`, which runs the lint on every push and pull request with full git history, so the staleness checks work. It needs no secrets.

The workflow checks out the version in `pin`, so CI runs the same Compass as your machine. With `pin` set to `''`, it runs the latest commit on `main`.

## Upgrading

1. Read the [CHANGELOG](CHANGELOG.md) for the new version.
2. Set `"pin"` in `compass.config.json` to the new tag, and update the tag in your own `lintCommand` or npm script if it names one.
3. Run `npx --yes github:EdwardBatt/Compass#<new tag> sync`. It rewrites every generated file to match.
4. Run the lint, and commit the config and the regenerated files together.

Until step 3, the lint reports the generated files as drift. That is intended: it means a procedure changed. `compass sync` and `compass doctor` say when the copy you are running is not the pinned version.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `npx github:EdwardBatt/Compass#vX.Y.Z …` prints nothing and exits 1 | The tag does not exist. Check the tag list on GitHub, or `git ls-remote --tags https://github.com/EdwardBatt/Compass` |
| An old version runs after an upgrade | npx cached it. Delete the `_npx` folder in your npm cache (`npm config get cache` shows where), then rerun |
| Every generated file is drift after an upgrade | Expected. Run `sync` at the new version (see *Upgrading*) |
| The lint fails on a file you never edited | A teammate synced with a different version. Run `compass doctor` to compare versions, then sync at the pinned one |
| The pre-commit hook does not run on Windows | Git for Windows runs hooks through its own `sh`, so commit from Git Bash, GitHub Desktop or VS Code. A hook installed from WSL needs WSL's `node` |
| A trap is "not in the index", or the index lists one with "no entry" | The entry must be a `###` heading, and the index line must copy it exactly. The error gives the anchor it expects |

## Design principles

- **The source wins.** A note is orientation, dated and assumed stale until checked. When a note contradicts the code, the note is fixed in the same session.
- **Point, don't copy.** Capsules are capped at 60 lines, and backticked paths must resolve, so a note stays a pointer rather than becoming a second copy of the code.
- **Errors are facts; warnings are judgement.** The lint fails only on things that are provably wrong right now.
- **Most sessions write nothing.** The bar for a trap is that it cost real time *and* its cause was hidden.
- **Hindsight is data.** The trajectory block's `missed:` field records what the map failed to point at — the only evidence for *why did the agent miss X*.
- **Project-agnostic.** Nothing in Compass knows your stack, your plan's name or your folder layout; the config does.

## Developing

```bash
npm test     # node:test, no dependencies; CI runs it on Linux, Windows and macOS, Node 18–22
```

See [CHANGELOG.md](CHANGELOG.md).

## Licence

[Mozilla Public License 2.0](LICENSE). You can use Compass in any project, commercial or closed-source, and your own files stay yours. If you distribute a modified version of Compass's own files, those changes must be shared under the MPL too.

**Exception for generated files.** Files that `compass init` and `compass sync` generate in your project, and the notes you write in your Compass store, are yours to use, change and distribute under any terms you choose. The MPL does not apply to them. It applies only to Compass itself.
