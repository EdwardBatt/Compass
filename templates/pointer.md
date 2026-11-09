## Compass — shared orientation

- Before touching an unfamiliar area, orient with {{startHow}}. It routes the task to one capsule and the source that matters; do not read the whole store
- `{{store}}/` is the shared orientation store, read and written by every AI tool on this project: `MAP.md` routes a task, `STATE.md` says what is actually built, `traps.md` holds non-obvious failures
- Write back with {{closeHow}}. Most sessions write nothing
- `{{lintCommand}}` lints the store for rot; run it, and fix its errors, before any commit
- Where a note and the code disagree, the code wins, and the note is fixed in the same session
- Never edit a generated Compass file or block; change `compass.config.json` and run `compass sync`
{{#if pointerNote}}- {{pointerNote}}
{{/if}}
