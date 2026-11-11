# Changelog

## 0.4.0 — 2026-11-11

Team mode: several people, one repository, and no two branches editing the same lines.

- **`"team": true`** (or `init --team`). The procedures speak to whoever is running the agent, read from git at run time, instead of to the owner. Decision records go to a new `approvers` list (empty means the owner). Work in progress lives in per-person session notes named `YYYY-MM-DD-<who>-<topic>.md`, carrying `author:` and `branch:`, and nobody edits a teammate's note. Start with no task lists teammates' in-flight work separately, so two people don't pick up the same thing.
- **One file per entry.** What several people add to is a folder: `state/<item>.md` replaces `STATE.md` (with `state:` and, when waiting, `waiting_on:`); `traps/<symptom>.md` replaces entries in `traps.md`, and the folder listing is the index; each person appends to their own `trajectories/<who>.md`. `MAP.md` stays one file, with rows kept in alphabetical order, and adding a row no longer bumps its `verified:`. Parallel branches therefore add different files, which every forge merges cleanly. **No merge drivers**: GitHub, GitLab and Bitbucket ignore `merge=union` when merging a pull request, so team mode never relies on one. Tested with plain git merges, which behave as a pull request merge does.
- **Trajectory logs.** Every close appends the session's trajectory, as one line with a `by:` field, to its author's log. Close appends without reading the file, and nothing but `compass report` reads it, so it costs a session the same whatever its size. The lint suggests archiving a log past 12,000 characters; the report reads archived logs too and counts an entry once even when a session note repeats it. A log entry's paths are history and are not checked.
- **Shared hook.** In team mode the pre-commit hook is generated into `.githooks/pre-commit` (committed, LF-only, drift-checked), and `compass hook` points `core.hooksPath` at it. It refuses to take over another tool's `hooksPath`, or to switch while `.git/hooks` holds hooks that would stop running. `doctor` and start say when a clone has not run it.
- **`compass lint --base <ref>`.** Errors stay project-wide; warnings cover only what the branch changed. New check: a note whose source the branch changed while leaving the note alone. In team mode, the generated CI uses it on pull requests.
- **`compass report`.** Gathers every trajectory: tasks the map could not route, what they missed (counted), capsules loaded and never loaded, in-flight work by person (asking about notes whose branch is merged or gone), what is waiting on whom, and stale notes by owner. `--json` too.
- **Owners.** `owners: [name]` in a note's front matter; every problem the lint reports about that note names them.
- **Lint.** In every mode: a front-matter key given twice, or two `MAP.md` rows for one task, is an error, because that is what a careless merge leaves behind. `origin: human:<name>` is valid. In a team store: state items, trap files and logs are checked for their type and shape, a trap file must be named as its heading, two state files may not describe one item, the state folder is checked against the plan as `STATE.md` is, a session note with no `author:` is an error, and one named by date alone is a warning.
- **Fix: `sources:` written as a YAML list** (`- path` lines, as the example store does) was read as empty, so those sources were never checked. Projects that use that form may see new, correct errors for sources that no longer exist.
- **Solo projects are unchanged.** With `team` off, every generated file is byte-for-byte what 0.3.1 writes, so upgrading causes no drift.
- **Upgrade note.** Set `"pin": "v0.4.0"` (and the tag in any `lintCommand` or npm script), then run `npx --yes github:EdwardBatt/Compass#v0.4.0 sync`. Solo projects see no change in their generated files. To switch a project to team mode, follow *Working as a team* in the README: set `"team": true` and `approvers`, run `compass init` again, move `STATE.md` into `state/`, and have each teammate run `compass hook` once.
- **README.** A new *Using it well* section: pointing Compass at the plan, roadmap and decision records, saying decisions in the session, answering start's report, and a team's working day.

## 0.3.1 — 2026-11-10

Commits from GitHub Desktop on Windows.

- **Fix: the pre-commit hook under GitHub Desktop on Windows.** On Windows, `npx` and `npm` are bash scripts. GitHub Desktop runs hooks with a Git that has no bash, so the script started the next bash on the PATH, usually WSL's, which cannot see Windows paths: every commit failed with `/bin/bash: C:/.../npx: No such file or directory`. When npm's entry points sit next to `node`, the hook now runs `npx` and `npm` through `node` directly. Elsewhere it uses them as before. Run `compass hook` again to update an installed hook.
- **Upgrade note.** Set `"pin": "v0.3.1"` (and the tag in any `lintCommand` or npm script), then run `npx --yes github:EdwardBatt/Compass#v0.3.1 sync` and `compass hook`. With `ci` on, the workflow file changes.

## 0.3.0 — 2026-11-09

Pinned versions, and an example to learn from.

- **Pinning.** A new `pin` setting holds the Compass tag a project runs. The generated CI workflow checks out that version, and an unset `lintCommand` uses it, so CI and every machine run the same Compass. `init` pins the version it ran. `sync` and `doctor` say when the running copy differs from the pin.
- **Example.** `examples/larder` is a small app with a complete store: two capsules, a MAP with spoken-language rows, STATE that catches an overstated plan, two traps, and a session note with a trajectory. The test suite lints it, so it can never fall out of date.
- **README.** New sections: prerequisites, the example, adopting Compass in an existing project, upgrading, and troubleshooting.
- **Upgrade note.** Projects on 0.2.0 can add `"pin": "v0.3.0"`, then run `npx --yes github:EdwardBatt/Compass#v0.3.0 sync`. With `ci` on, only the workflow file changes.

## 0.2.0 — 2026-11-09

From a blank repository to a working store, without guesswork.

- **Plan drift.** The lint compares `STATE.md` with the plan and roadmap named in `compass.config.json`, using git history. No note has to list the plan as a source for this to work, and a note that does is not reported twice.
- **Session notes are snapshots.** Later changes to their sources no longer warn. The promote-or-archive warning still covers their age.
- **Discovery.** `init` finds a plan, roadmap, decision-record folder and schema under common names and pre-fills the config, keeping the spelling on disk. The lint and `doctor` point out unset paths that could be filled. Setting a path to `false` means "this project has none" and stops the hint.
- **Placeholders.** `init` marks the store README's first paragraph with `<!-- compass:todo -->`, and the lint warns until it is written.
- **Guidance.** On an empty store or a project with no plan, start says what to do first instead of "all sources silent". Close has a new step 7 that wires new plans and decision folders into the config.
- **init.** Takes the owner from `git config user.name`, accepts `--ci` and `--hook`, and ends with numbered next steps.
- **CLI.** `compass version` / `--version`. `doctor` shows every configured path and every hint.
- **Fix.** A config path that is not a string no longer crashes validation.
- **CI.** Tests run on Linux, Windows and macOS, on Node 18, 20 and 22.

## 0.1.0 — 2026-11-09

First release, extracted from a production SaaS monorepo.

- `init`, `sync`, `lint`, `doctor`, `hook`. Node built-ins only.
- One config generates files for Claude Code, Cursor, Gemini, Antigravity and `AGENTS.md`. Hand edits fail the lint.
- The lint checks links, anchors, backticked paths, front matter, capsule density and abstracts, the traps index, staleness by date and git, and size caps.
