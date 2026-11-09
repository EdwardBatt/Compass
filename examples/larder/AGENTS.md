# Agent instructions

<!-- compass:begin — generated from compass.config.json; edit that, then run `compass sync` -->
## Compass — shared orientation

- Before touching an unfamiliar area, orient with the steps in `docs/compass/protocol/start.md`. It routes the task to one capsule and the source that matters; do not read the whole store
- `docs/compass/` is the shared orientation store, read and written by every AI tool on this project: `MAP.md` routes a task, `STATE.md` says what is actually built, `traps.md` holds non-obvious failures
- Write back with the steps in `docs/compass/protocol/close.md`. Most sessions write nothing
- `npm run compass` lints the store for rot; run it, and fix its errors, before any commit
- Where a note and the code disagree, the code wins, and the note is fixed in the same session
- Never edit a generated Compass file or block; change `compass.config.json` and run `compass sync`
<!-- compass:end -->
