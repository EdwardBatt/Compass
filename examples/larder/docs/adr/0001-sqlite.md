# 0001 — SQLite as the only database

**Status:** Accepted

**Context.** Larder is a household app: a few users per instance, one server, and backups that should be one file.

**Decision.** SQLite, through `node:sqlite`. No ORM.

**Alternatives.** Postgres (a second service to run, for no gain at this size); a JSON file (no constraints, no transactions).

**Consequences.** One writer at a time, which a household never notices. Moving to Postgres later means rewriting `src/lib/db.js` only.
