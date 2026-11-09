# Changelog

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
