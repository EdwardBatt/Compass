Orient yourself in {{project}} before starting work on: **{{args}}**

{{#if team}}**Several people work on this repository at once.** First find out who you are working with and where: `git config user.name` and `git branch --show-current`. "You" and "yours" below mean that person and that branch. Other people's notes describe their work, not yours. If `git config core.hooksPath` prints nothing, mention once that this clone does not run the pre-commit lint and that `compass hook` sets it up.

{{/if}}**If no task was given, do not guess and do not read the store — propose.** Read only these, in this order:

{{#if team}}1. `{{store}}/state/` — one search for the lines starting `state:` or `waiting_on:` across its files gives every item and its state in one result; open only the items marked `waiting` or `partial`. It describes the main branch; in-flight work is not kept there.
1. Each file in `{{store}}/sessions/` other than its README — the `author:` and `branch:` in its front matter, then its `**In flight**` and `**Unresolved**` lines. Yours are the notes whose author is you or whose branch is the current one; read the newest of those in full.
1. **Notes on other branches.** Work in progress lives on branches that are not merged yet, so its notes are not in your checkout. Run `git branch -a --no-merged`, and for each branch list `git ls-tree --name-only <branch> {{store}}/sessions/`; read, with `git show <branch>:<path>`, each note that is not in your checkout — its `author:`, `branch:`, `**In flight**` and `**Unresolved**` lines.
{{else}}1. `{{store}}/STATE.md` — its `## {{stateInFlight}}` and `## {{stateWaiting}}` sections.
1. The newest file in `{{store}}/sessions/`, if one exists — its `**In flight**` and `**Unresolved**` lines.
{{/if}}1. `git status --short` and `git log --oneline -5`.
{{#if plan}}1. {{#if roadmap}}`{{roadmap}}` — its status table, to find the earliest unfinished phase. Then only that phase's section of `{{plan}}`{{else}}`{{plan}}` — only the section for the earliest unfinished milestone{{/if}}. Never read the whole plan.
{{/if}}

Offer {{operator}} a numbered shortlist, most urgent first, one line each, saying what it is and why it is urgent. {{#if team}}Their own in-flight work comes first. Then list, separately and one line each, what teammates have in flight and whose it is — **so nobody picks up work someone else already has.** {{/if}}Close with a status line: what is uncommitted, and what the last commit was. Name the {{#if team}}newest `verified:` date among the state files{{else}}`verified:` date of `STATE.md`{{/if}} — **the list is only as current as the last close, and {{operator}} must be able to see that.** If every source is silent, say so plainly rather than padding the list.

{{#if plan}}{{else}}**No plan is configured** — `paths.plan` in `compass.config.json` is empty, so there is nothing to propose work from. Say so first. If the project has a plan under another name, offer to add it to the config. If it has none yet, the most useful next step is usually to write one: a short list of milestones in any Markdown file. Then set `paths.plan` and run `compass sync`, so the next start proposes from it.

{{/if}}**If the store is still empty** — `MAP.md` has no rows and `{{stateFile}}` has no entries — say that Compass is new here and fills itself as work happens: ask for the first task, and expect the first close to add the first map row. Do not invent notes to fill it.

Then **stop and wait.** Do not read a capsule. Do not start work. When {{operator}} picks one, treat the answer as the task and run the protocol below from step 1.

---

Follow the tiered protocol. Stop as soon as you have enough — do not read the whole store.

1. Read `{{store}}/README.md`.
1. Read `{{store}}/MAP.md` and find the row matching the task above.
1. Read **only** the capsule that row names.{{#if team}}
1. **Check whether a teammate already has this.** List the session notes in `{{store}}/sessions/` and on unmerged branches (`git branch -a --no-merged`, then `git ls-tree --name-only <branch> {{store}}/sessions/`), and read, with `git show <branch>:<path>` for those not in your checkout, any whose topic touches the task. If one does, its branch, what it says is done and in flight, and its *Unresolved* lines decide where you start — continue that work on its branch rather than beginning again.{{/if}}
{{#if team}}1. If the task depends on whether something is already built — plans describe more than is built, so it usually does — search `{{store}}/state/` for its `state:` lines (one result, one line per item, named by file), then open **only** the item files your task touches.
1. If the task involves debugging, deployment, or something that "should work", list `{{store}}/traps/` — **each file is named as its symptom** — and open only the ones that could be yours.{{else}}1. Read `{{store}}/STATE.md` if the task depends on whether something is already built. Plans describe more than is built, so this is usually worth the read.
1. Read `{{store}}/traps.md` if the task involves debugging, deployment, or something that "should work" — **its index first, then only the entries whose symptom could be yours.** The index lines are worded as symptoms, so match against what you are looking at.{{/if}}
1. Open the source files the capsule named. **They win over any note.**
1. **The capsule is where to start, not where to stop.** Before you change something, search for what else uses it — its callers, and the existing files, data, examples and fixtures it reads — and open the ones your change could break. A change that works for the case in front of you can break an input the capsule never mentioned.

Then report back, briefly:

- which capsule you loaded, and why that one;
- the source files you will need, and anything the capsule says is a known problem in them;
- what else uses what you will change, found by searching beyond the capsule, and anything there your change must keep working;
{{#if adr}}- the decisions in `{{adr}}` that bind this work, by number, and whether any is only proposed or has been superseded;
{{/if}}- anything in `{{stateFile}}` saying this is already built, partly built, or waiting on a decision;
- any trap that applies;
{{#if team}}- anything a teammate's session note says is in flight in the same area, and whose it is;
- anything that needs a person before you can proceed, and who.
{{else}}- anything that needs {{owner}} before you can proceed.
{{/if}}

**If a note contradicts the source, say so explicitly.** The source is right — fix the note in this session and set its `verified:` date to today.

**If the task touches a rule in {{rulesList}}, name the rule and say how the change respects it.** A change that breaks one is a decision, not a refactor.

## The trajectory block

End the report — either kind — with a fenced block recording what context this task was actually given. Exactly these keys, so it can be pasted into a session note later and grepped:

```text
trajectory: YYYY-MM-DD — <the task, in a few words>
  capsule: capsules/<name>.md
  adrs:    0006, 0009
  source:  src/one.ts, src/two.ts
  also:    {{stateFile}}, {{trapsFile}}
  missed:  —{{#if team}}
  by:      <git config user.name>{{/if}}
```

- `capsule:` — the one you loaded, or `none — no row in MAP.md matched` if the map did not route you. Say which, honestly. **A task the map cannot route is the most useful thing this block records.**
- `adrs:` — decision numbers only, from the map row and anything the capsule named.
- `source:` — the files you actually opened, not the ones the capsule listed.
- `also:` — `{{stateFile}}` / `{{trapsFile}}` if you read them. Omit the line if you read neither.
- `missed:` — always `—` here. It can only be filled in afterwards, at close, once the task has shown what it really needed.{{#if team}}
- `by:` — who you are working with, from `git config user.name`. Close appends this block, as one line, to your own trajectory log.{{/if}}

Emit the block even when the answer is "nothing matched".

**Do not start work until you have reported.**
