---
type: map
status: current
origin: ai-derived
verified: 2026-11-09
sources: []
---

# Map — what to read for the task in front of you

Find the row that matches your task. Read that capsule. Then read the source files it names. Do not read the other capsules.

Each row carries its capsule's **abstract**, copied verbatim from the capsule's front matter and held identical by the lint, so the map alone says whether a capsule is the right one.

**The left column is the words somebody would actually say**, not module names. If two rows match one spoken task, the rows are wrong. If none does, that is the most useful thing this file can tell you — record it as `missed:` in the trajectory block and fix the map at close. Write every source path in full, from the project root.

| Your task touches… | Capsule | Source to open | Decisions that bind it |
|---|---|---|---|
| "the list has two lines for onions", combining ingredients, quantities that add up wrong, units, cups vs grams | [shopping-list](capsules/shopping-list.md) — How recipe ingredients become one shopping list: base units, the merge key, and what deliberately does not merge. | `src/lib/merge.js`, `src/lib/units.js`, `spec/merge.spec.js` | 0002 |
| new table, new column, "where is X stored", database file location | [storage](capsules/storage.md) — Where Larder's data lives, how the schema is applied at startup, and why there is no ORM or migration tool. | `db/schema.sql`, `src/lib/db.js` | 0001 |

## Not covered by a capsule

No capsule exists for these. Go to the source or the document named; write a capsule only when a session shows one is genuinely needed.

| Area | Where | Decisions |
|---|---|---|
| Adding an endpoint, routing, "404 on a route that exists" | `src/server.js` (prefix table), `src/routes/` | — |
| Recipe listing | `src/routes/recipes.js` | — |
| "is the plan right?", what is ticked versus what runs | `PLAN.md`, then `docs/compass/STATE.md` | — |
| Sharing a list, offline ticking (M2, not built) | `PLAN.md` | — |
