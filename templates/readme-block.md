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

{{authorityList}}

A note never overrides code. When one contradicts the source, **the source is right, the note is fixed in the same session, and you say so out loud.** Never leave both readings standing.

## What does not go in here

**Decisions.** {{#if adr}}They are decision records in `{{adr}}`. {{/if}}A note that records a decision is a second, unversioned copy of one.

**Rules.** They are {{rulesList}}.

**Schemas and contracts.** {{#if schema}}They are `{{schema}}` and the source that defines them.{{else}}They are the source that defines them.{{/if}} A note that reproduces one has become a second copy that will drift — cite it instead.

**Plans and task lists.** {{#if plan}}They are `{{plan}}`.{{else}}They belong in the project's plan, not here.{{/if}}

## The bar for writing anything

Most sessions add nothing here, and that is the intended outcome.

A **trap** goes in only if it cost real time *and* the cause was not visible from the symptom. A **capsule** changes only when the shape of a domain changes in a way that will still be true next quarter. `STATE.md` changes when something becomes built, breaks, or starts waiting on a person.

Every note carries `verified:` — the date it was last checked against real code — and `origin:`, which says whether a human asserted it or an AI inferred it. **An agent may never rewrite an `origin: human` line**; it marks it superseded and cites the instruction that superseded it.

## Health

Run `{{lintCommand}}` from anywhere in the project. It checks dead links and anchors, backticked paths (read from the project root), missing headers, density, staleness against the date and against git, the traps index, and whether any generated file was edited by hand.

Errors are provably wrong right now. Warnings are judgement calls for a human.
