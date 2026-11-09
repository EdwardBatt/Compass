---
type: state
status: current
origin: ai-derived
verified: 2026-11-09
sources:
  - src/routes/lists.js
  - src/routes/recipes.js
---

# State — what is actually built

What runs today, as checked against the code. The plan says what is intended; this file says what is true.

## Working

- Recipe listing (`src/routes/recipes.js`). Read only: there is no create endpoint, although M1 in `PLAN.md` is ticked. See *Confirmed problems*.
- Shopping lists merge on read (`src/routes/lists.js`), per ADR 0002, with tests in `spec/merge.spec.js`.

## Partially built

- The list endpoint reads a list but cannot add to one. Items reach `list_item` only by hand.

## Not built — described but absent

- Sharing a list, offline ticking (M2) and the pantry (M3).

## Confirmed problems

- `PLAN.md` ticks "Recipe API: list, read, create", but only listing exists. The plan overstates M1. (found 2026-11-09)

## Waiting on Sam

- Build the recipe create endpoint, or untick it in `PLAN.md`.
- Whether to adopt a migration tool before the first `ALTER TABLE` (see [storage](capsules/storage.md)).

## In flight right now

- Nothing. The last session finished the pickles fix.
