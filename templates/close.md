Update `{{store}}/` with what this session actually learned. {{closeArgs}}

**Be strict about what qualifies. Most sessions should change one or two files, and many should change none{{#if team}} beyond the one line appended to your trajectory log (step 6b){{/if}}.** If nothing here is durable, say so and stop — do not manufacture an entry. A store that fills with entries nobody needed is the failure this system exists to avoid.

Work through these in order.

{{#if plan}}**0. The plan** (`{{plan}}`) — before ticking a box, re-read the **whole milestone** it sits in, not just the line you had in hand. The same gap is often described twice: once as an open item written before the build, and once as the result you are about to record. Tick or strike every line the work closed, in one edit. **A milestone that says both "open" and "built" about one thing is the drift this routine exists to prevent**, and the lint cannot see it, because it does not read the plan.

{{/if}}{{#if team}}**1. Traps** (`traps/`) — did anything take more than a few minutes to understand, where the cause was **not visible from the symptom**? Write it as **its own file, named as the symptom: `traps/<the-symptom-in-a-few-words>.md`**, with the same front matter as any note (`type: trap`), a `#` heading that is the symptom in words (the file name is that heading, lowercased with hyphens — the lint checks), what it cost, and the test that now catches it, if one does. **There is no index to update**: the folder listing is the index, so two people adding traps on two branches never touch the same file. Skip general advice; {{rulesList}} are where rules live.{{else}}**1. Traps** (`traps.md`) — did anything take more than a few minutes to understand, where the cause was **not visible from the symptom**? Add it, worded as the symptom, with what it cost. Where a test now catches it, name that test. Then **add it to the index**, with exactly the entry's heading — the lint fails on an entry the index does not list, because an unindexed entry is one nobody will ever be routed to. Skip general advice; {{rulesList}} are where rules live.{{/if}}

{{#if team}}**2. State** (`state/`) — did something become built, break, or start waiting on a person? **Each item is its own file, `state/<item>.md`** — edit the item's file, or add one for a new item. Front matter as any note (`type: state`), plus `state:` — one of `working`, `partial`, `absent` (described somewhere but not built), `broken` or `waiting` — and, for `waiting`, `waiting_on:` the person. Then a `#` heading naming the item and one to three lines on what is true, pointing at source. Set `verified:` on the item you changed, and only that one.

**The state folder describes the main branch.** On a feature branch, write the item as it will be once this branch merges: review is where that claim is checked. **Never record in-flight work here** — it goes in your session note (step 6). Two branches only ever touch the same file when they change the same item, and then the merge conflict is a real disagreement for a person to settle. Delete an item's file only when the item no longer exists at all.{{else}}**2. State** (`STATE.md`) — did something become built, break, or start waiting on a decision? Update the sections that say what works and what is partly built, and `{{stateWaiting}}` and `{{stateInFlight}}`.{{/if}}

**Record what a state means, never restate the plan.** {{#if plan}}`{{plan}}` owns the work{{#if roadmap}} and `{{roadmap}}` owns phase status{{/if}}; this file points at them and does not copy them.{{else}}This file points at the plan and does not copy it.{{/if}}

**3. Capsules** (`capsules/`) — did the shape of a domain change in a way that will still be true next quarter? Edit the existing capsule; do not add one unless a whole cluster of work has no home.

Keep it under **{{caps.capsuleLines}} lines** of content and keep it **pointing at source**, with paths written in full from the project root. **A capsule that reproduces a schema, a contract or a decision has become a second copy that will drift** — cite it instead. If you change a capsule's `abstract:`, change `MAP.md`'s copy in the same edit; the lint compares them character for character.

**4. The map** (`MAP.md`) — did this session's task fail to match a row? Add one, worded as somebody would speak the task rather than as a module name. **This is the highest-value edit in the routine**, and it is the only one that fixes the store's blind spot: the lint can compare rows that exist and can say nothing about a subject with no row at all. Route it to a capsule only if one genuinely fits; the "Not covered by a capsule" table is the right home for most. A row that grows past a paragraph is a capsule waiting to be written.{{#if team}}

**Keep the rows in alphabetical order of their first column, and put a new row in its place, not at the end** — two branches adding different rows then usually edit different lines. Adding or editing a row does not re-check the whole map: leave `MAP.md`'s `verified:` alone unless you did, or every branch would edit that one line.{{/if}}

**5. Decisions** — if a decision was made, it becomes {{#if adr}}a **decision record in `{{adr}}`**, following the existing numbering, with alternatives{{else}}a decision record, wherever this project keeps them{{/if}}. Draft it and stop; {{#if team}}it goes to {{approvers}} to accept or reject, in review.{{else}}{{owner}} accepts it.{{/if}} **A decision never goes in a Compass note** — that would be a second, unversioned copy of one.

{{#if team}}**6. Session note** — only if {{operator}} asked for one, or the session leaves work genuinely mid-flight that the next session must pick up. Format is in `sessions/README.md`, with two rules that make it safe for several people at once:

- **Name it `YYYY-MM-DD-<who>-<topic>.md`** — `<who>` from `git config user.name`, lowercased with hyphens; `<topic>` a word or two. A bare date collides the first time two people write on the same day.
- **Its front matter carries `author:`** (the `git config user.name`) **and `branch:`** (`git branch --show-current`). Start uses them to tell this person's work from a teammate's; the lint fails a session note without an author.

**If you already have a note for this branch, amend it rather than adding one**: strike any *Unresolved* or *In flight* line this session resolved, with the commit that did. **Never edit a teammate's note** — tell {{operator}} what in it looks resolved or wrong, and leave it to its author. Strike an in-flight line when the work is done — not when the branch merges: a branch is often merged with half its work still to come.{{else}}**6. Session note** — only if {{owner}} asked for one, or the session leaves work genuinely mid-flight that the next session must pick up. Format is in `sessions/README.md`. **If a note for today already exists, amend it rather than leaving it**: strike any *Unresolved* or *In flight* line this session resolved, with the commit that did. A note frozen at the morning's state misleads the next start, which reads only the newest one.{{/if}}

{{#if team}}**6b. Your trajectory log** (`{{store}}/trajectories/<who>.md`, `<who>` from `git config user.name`, lowercased with hyphens) — **every session, even one that changes nothing else.** Append the session's **trajectory as one line** — the block the start emitted, with `missed:` now filled in, joined with ` | `. Each person appends only to their own file, so two people never edit the same file:

```text
- trajectory: YYYY-MM-DD — <the task> | by: <name> | capsule: capsules/<name>.md | adrs: — | source: src/one.ts, src/two.ts | also: state/ | missed: —
```

`missed:` is what this task turned out to need that `MAP.md` did not point at. **That field is the only evidence for *why did the agent miss X*, it can only be written in hindsight, and across a team it is how `compass report` finds the map's blind spots.** If nothing was missed, `missed: —`. If the start was never run, append `- trajectory: YYYY-MM-DD — not recorded, start was not used | by: <name>` rather than reconstructing one. Keep ` | ` out of the values themselves.

**Append to the end without reading the file** — with a shell append if you have one, or by reading only its last few lines. Never read it whole: nobody needs it but `compass report`, and it grows every session. Never edit an existing entry. If your file is missing, create it with front matter `type: log` (`status: current`, `origin: ai-derived`, `verified:` today, `sources: []`) and a `# Trajectories — <name>` heading. A session note does not repeat the block; the log holds it.{{else}}When you do write one, carry the session's **trajectory** — the block the start emitted, with `missed:` now filled in: what this task turned out to need that `MAP.md` did not point at. **That field is the only evidence for *why did the agent miss X*, and it can only be written in hindsight.** If nothing was missed, `missed: —`. If the start was never run, write `trajectory: not recorded — start was not used` rather than reconstructing one.

**The trajectory never justifies a session note.** If rule 6 says no note, there is no note; report the trajectory in the session and let it go.{{/if}}

**7. The config** (`compass.config.json`) — did this session create a plan, a roadmap, a folder of decision records or a schema that `paths` does not name? Add it and run `compass sync`, so every procedure and every tool starts using it. The lint names likely candidates it finds; it never wires them in by itself. Set a path to `false` when the project deliberately has none.

## Rules while writing

- **Update in place.** A new file needs a reason.
- **Set `verified:` to today on every note you touch**, and only on notes you actually re-checked against code.
{{#if team}}- **Never rewrite a line a person wrote** (`origin: human`, or `origin: human:<name>` when it says who). Mark it superseded and cite the instruction that superseded it. A note written on a person's word records whose: `origin: human:<name>`.
- **A note with `owners:` belongs to those people.** If you change it, or find the code contradicts it, name them in your report so review reaches them.{{else}}- **Never rewrite an `origin: human` line.** Mark it superseded and cite the instruction that superseded it.{{/if}}
- **Mark inference as `(inferred)`.** Where a reason cannot be established, write "reason unknown — inferred from the code" rather than inventing one.
- **Do not paste source into a note.** Point at it.
- **Never edit a generated file** (`protocol/`, the tool rule files, anything between `compass:begin` and `compass:end`). Change `compass.config.json` and run `compass sync`.
- If a note contradicted the code this session, it should already be fixed — confirm it is.

## Then

Run `{{lintCommand}}` and fix what it reports. Errors are provably wrong; warnings are judgement calls.

Finally, tell {{operator}} in a few lines which files you changed and why — and **anything the code contradicted**: a note that turned out to be wrong, and what it now says. Those are the clearest evidence a note is drifting, and they are otherwise invisible, buried inside an edit. Then stop.{{#if ownerCommits}} Do not commit; {{operator}} does.{{/if}}
