---
type: capsule
status: current
origin: ai-derived
verified: 2026-11-09
abstract: How recipe ingredients become one shopping list: base units, the merge key, and what deliberately does not merge.
sources:
  - src/lib/merge.js
  - src/lib/units.js
  - docs/adr/0002-merge-by-name-and-base-unit.md
---

# Shopping list

## Shape

A list is rows in `list_item` (`db/schema.sql`). Rows are stored as added, one per recipe ingredient; **merging happens on read**, in `src/routes/lists.js`, by calling `merge()` from `src/lib/merge.js`. Nothing merged is ever written back.

## The merge key

`singular(name) | base unit`. Both halves matter:

- `src/lib/units.js` converts every unit to `g`, `ml` or `count`. An unknown unit throws rather than guessing.
- The name is lower-cased and made singular. The pluralisation rule is deliberately small; see the pickles trap in [traps.md](../traps.md#pickles-became-pickl-and-stopped-merging).

## What does not merge, on purpose

- Flour in grams and flour in cups. Volume to weight needs a density table; ADR 0002 defers it to M3. Do not "fix" this by merging on name alone.
- Different names for one thing ("spring onion", "scallion"). No synonym table exists, and none is planned.

## Known gaps

- Merged quantities are not rounded for display; 3 × 236.588 ml shows as 709.764. (inferred from the code; no test covers display)

## Tests

`spec/merge.spec.js`. Run `npm test`.
