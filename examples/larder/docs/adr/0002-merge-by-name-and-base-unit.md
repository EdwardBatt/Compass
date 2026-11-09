# 0002 — Merge shopping-list items by name and base unit

**Status:** Accepted

**Context.** Two recipes on one list both need onions: "2 onions" and "1 onion" should become "3 onions", and "200 g flour" plus "100 g flour" should become one line.

**Decision.** Convert every quantity to its base unit (`src/lib/units.js`), then merge items whose name, lower-cased and singular, and base unit both match (`src/lib/merge.js`).

**Alternatives.** Merge by name only (adds grams to millilitres); never merge (a list with five onion lines).

**Consequences.** A cup of flour converts by volume, so it stays a separate line from flour in grams. Converting volume to weight needs a density table, which is out of scope until M3.
