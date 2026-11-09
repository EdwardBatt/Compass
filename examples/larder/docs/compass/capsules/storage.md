---
type: capsule
status: current
origin: human
verified: 2026-11-09
abstract: Where Larder's data lives, how the schema is applied at startup, and why there is no ORM or migration tool.
sources:
  - src/lib/db.js
  - db/schema.sql
  - docs/adr/0001-sqlite.md
---

# Storage

## Shape

One SQLite file, `larder.db` in the working directory, or wherever `LARDER_DB` points. `src/lib/db.js` opens it with `node:sqlite` and applies `db/schema.sql` on every start, rewritten to `CREATE TABLE IF NOT EXISTS`.

That rewrite is the whole migration system. **It creates missing tables; it never alters an existing one.** A new column on an existing table needs a hand-written `ALTER TABLE` until a migration tool is chosen (not decided — raise it with Sam before adding one).

## Rules that apply

From `CONTRIBUTING.md`: quantities are stored in base units only, and every schema change goes in `db/schema.sql`. The `CHECK (unit IN ...)` constraints enforce the first.

## Decisions

ADR 0001: SQLite only, no ORM. Swapping the database means rewriting `src/lib/db.js` and nothing else; keep SQL out of `src/lib/merge.js` and `src/lib/units.js` so that stays true.
