---
type: trap
status: current
origin: ai-derived
verified: 2026-11-09
sources:
  - src/lib/merge.js
  - src/lib/db.js
---

# Traps

Non-obvious failure modes that have actually cost time on this project. Each one is here because something broke, not because it might. **Read the index before debugging anything that "should work".**

**The bar for an entry:** it took more than a few minutes to understand AND the cause was not visible from the symptom. General advice does not go here. Neither does anything a stack trace names. Each entry ends with what it cost, and names the test that now catches it, if one does.

## Index — read this, then only the entries you need

Scan the lines below, open the two or three that could be your symptom, skip the rest. **Word each line as the SYMPTOM, not the cause**, and copy the entry's heading exactly: the lint fails on an entry the index does not list.

- [Pickles became "pickl" and stopped merging](#pickles-became-pickl-and-stopped-merging)
- [A new column is missing although it is in schema.sql](#a-new-column-is-missing-although-it-is-in-schemasql)

---

### Pickles became "pickl" and stopped merging

"pickles" and "pickle" showed as two lines. The singular rule stripped a trailing `es` from every word, so "pickles" became "pickl" while "pickle" became "pickle". The list looked right for onions and tomatoes, which hid it.

`src/lib/merge.js` now strips `es` only after o, s, x, z, ch or sh. Caught by *pickles merge with pickle* in `spec/merge.spec.js`. Cost: an evening, because the bug only showed on real recipes.

### A new column is missing although it is in schema.sql

A column added to an existing table in `db/schema.sql` never appears, and inserts fail with "no such column". The startup step in `src/lib/db.js` turns each statement into `CREATE TABLE IF NOT EXISTS`, so a table that already exists is skipped whole.

Delete the local `larder.db` in development, or write an `ALTER TABLE`. Not caught by a test. Cost: an hour.
