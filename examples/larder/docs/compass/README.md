---
type: map
status: current
origin: human
verified: 2026-11-09
sources: []
---

# Larder — start here

Shared, agent-independent memory for **Larder**. One store, read and written by every AI tool that works on this repository. Plain Markdown in git: no plugins, no database, no sync step.

Larder is a household recipe book that turns the week's recipes into one merged shopping list. It is a single Node server (`src/server.js`) with thin route handlers in `src/routes/` and all logic in `src/lib/`, over one SQLite file (`db/schema.sql`). There is no front end yet; M2 in `PLAN.md` is the current work. `STATE.md` says what actually runs.

<!-- compass:begin — generated from compass.config.json; edit that, then run `compass sync` -->
## Read in this order. Stop as soon as you have enough.

| Tier | Read | When |
|---|---|---|
| 0 | this file | every session |
| 1 | [MAP.md](MAP.md) | every session — it routes you to the rest |
| 1 | [STATE.md](STATE.md) | when the task depends on what is already built |
| 1 | [traps.md](traps.md) | before debugging anything that "should work" — its index, then only the entries that match |
| 2 | one capsule from [capsules/](capsules/) | the map names it |
| 3 | the actual source files | always, last, and they win |

Do **not** read the whole folder. Do not read a capsule the map did not name for your task.

The procedures are [protocol/start.md](protocol/start.md), to orient before work, and [protocol/close.md](protocol/close.md), to write back after it. In Claude Code they are `/compass-start` and `/compass-close`.

## What wins when sources disagree

1. **The source code**, for what the system *does*, and `db/schema.sql` for what the schema is. Always. A note that contradicts them is wrong.
2. **`docs/adr/`**, for why something is shaped as it is. Check each decision's status line: a proposed one does not bind yet.
3. **`CONTRIBUTING.md`** — the rules of working here.
4. **`PLAN.md`** for tasks.
5. **This store** — orientation. Dated, and assumed stale until checked.

A note never overrides code. When one contradicts the source, **the source is right, the note is fixed in the same session, and you say so out loud.** Never leave both readings standing.

## What does not go in here

**Decisions.** They are decision records in `docs/adr/`. A note that records a decision is a second, unversioned copy of one.

**Rules.** They are `CONTRIBUTING.md`.

**Schemas and contracts.** They are `db/schema.sql` and the source that defines them. A note that reproduces one has become a second copy that will drift — cite it instead.

**Plans and task lists.** They are `PLAN.md`.

## The bar for writing anything

Most sessions add nothing here, and that is the intended outcome.

A **trap** goes in only if it cost real time *and* the cause was not visible from the symptom. A **capsule** changes only when the shape of a domain changes in a way that will still be true next quarter. `STATE.md` changes when something becomes built, breaks, or starts waiting on a person.

Every note carries `verified:` — the date it was last checked against real code — and `origin:`, which says whether a human asserted it or an AI inferred it. **An agent may never rewrite an `origin: human` line**; it marks it superseded and cites the instruction that superseded it.

## Health

Run `npm run compass` from anywhere in the project. It checks dead links and anchors, backticked paths (read from the project root), missing headers, density, staleness against the date and against git, the traps index, and whether any generated file was edited by hand.

Errors are provably wrong right now. Warnings are judgement calls for a human.
<!-- compass:end -->
