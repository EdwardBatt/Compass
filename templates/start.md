Orient yourself in {{project}} before starting work on: **{{args}}**

**If no task was given, do not guess and do not read the store — propose.** Read only these, in this order:

1. `{{store}}/STATE.md` — its `## {{stateInFlight}}` and `## {{stateWaiting}}` sections.
1. The newest file in `{{store}}/sessions/`, if one exists — its `**In flight**` and `**Unresolved**` lines.
1. `git status --short` and `git log --oneline -5`.
{{#if plan}}1. {{#if roadmap}}`{{roadmap}}` — its status table, to find the earliest unfinished phase. Then only that phase's section of `{{plan}}`{{else}}`{{plan}}` — only the section for the earliest unfinished milestone{{/if}}. Never read the whole plan.
{{/if}}

Offer {{owner}} a numbered shortlist, most urgent first, one line each, saying what it is and why it is urgent. Close with a status line: what is uncommitted, and what the last commit was. Name the `verified:` date of `STATE.md` — **the list is only as current as the last close, and {{owner}} must be able to see that.** If every source is silent, say so plainly rather than padding the list.

{{#if plan}}{{else}}**No plan is configured** — `paths.plan` in `compass.config.json` is empty, so there is nothing to propose work from. Say so first. If the project has a plan under another name, offer to add it to the config. If it has none yet, the most useful next step is usually to write one: a short list of milestones in any Markdown file. Then set `paths.plan` and run `compass sync`, so the next start proposes from it.

{{/if}}**If the store is still empty** — `MAP.md` has no rows and `STATE.md` has no entries — say that Compass is new here and fills itself as work happens: ask for the first task, and expect the first close to add the first map row. Do not invent notes to fill it.

Then **stop and wait.** Do not read a capsule. Do not start work. When {{owner}} picks one, treat the answer as the task and run the protocol below from step 1.

---

Follow the tiered protocol. Stop as soon as you have enough — do not read the whole store.

1. Read `{{store}}/README.md`.
1. Read `{{store}}/MAP.md` and find the row matching the task above.
1. Read **only** the capsule that row names.
1. Read `{{store}}/STATE.md` if the task depends on whether something is already built. Plans describe more than is built, so this is usually worth the read.
1. Read `{{store}}/traps.md` if the task involves debugging, deployment, or something that "should work" — **its index first, then only the entries whose symptom could be yours.** The index lines are worded as symptoms, so match against what you are looking at.
1. Open the source files the capsule named. **They win over any note.**

Then report back, briefly:

- which capsule you loaded, and why that one;
- the source files you will need, and anything the capsule says is a known problem in them;
{{#if adr}}- the decisions in `{{adr}}` that bind this work, by number, and whether any is only proposed or has been superseded;
{{/if}}- anything in `STATE.md` saying this is already built, partly built, or waiting on a decision;
- any trap that applies;
- anything that needs {{owner}} before you can proceed.

**If a note contradicts the source, say so explicitly.** The source is right — fix the note in this session and set its `verified:` date to today.

**If the task touches a rule in {{rulesList}}, name the rule and say how the change respects it.** A change that breaks one is a decision, not a refactor.

## The trajectory block

End the report — either kind — with a fenced block recording what context this task was actually given. Exactly these keys, so it can be pasted into a session note later and grepped:

```text
trajectory: YYYY-MM-DD — <the task, in a few words>
  capsule: capsules/<name>.md
  adrs:    0006, 0009
  source:  src/one.ts, src/two.ts
  also:    STATE.md, traps.md
  missed:  —
```

- `capsule:` — the one you loaded, or `none — no row in MAP.md matched` if the map did not route you. Say which, honestly. **A task the map cannot route is the most useful thing this block records.**
- `adrs:` — decision numbers only, from the map row and anything the capsule named.
- `source:` — the files you actually opened, not the ones the capsule listed.
- `also:` — `STATE.md` / `traps.md` if you read them. Omit the line if you read neither.
- `missed:` — always `—` here. It can only be filled in afterwards, at close, once the task has shown what it really needed.

Emit the block even when the answer is "nothing matched".

**Do not start work until you have reported.**
