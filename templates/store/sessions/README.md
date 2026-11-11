---
type: map
status: current
origin: ai-derived
verified: {{today}}
sources: []
---

# Session notes

**Most sessions do not get one.** Write one only when asked, or when a session leaves work genuinely mid-flight that the next session must pick up.

A note written to record that a session happened is landfill. The test: would somebody starting tomorrow be worse off without it?

## Format

{{#if team}}`YYYY-MM-DD-<who>-<topic>.md` — `<who>` from `git config user.name`, lowercased with hyphens — so two people writing on the same day never collide. Front matter `type: session`, `author:` (the `git config user.name`) and `branch:` (the branch the work is on); start uses them to tell your notes from a teammate's, and the lint fails a session note with no author. **Never edit a teammate's note.** Then these headings{{else}}`YYYY-MM-DD.md`, front matter `type: session`, and these headings{{/if}} — omit any that would be empty:

- **Changed** — what shipped, with plan references
- **Why** — what prompted it, if not obvious from the plan
- **Discovered** — one line per trap, linking to `{{trapsFile}}` where the detail now lives
- **Decided** — one line per decision, linking to the decision record where it now lives
- **Unresolved** — what is waiting on a person
- **In flight** — what is half-done, and where the next session should start
{{#if team}}- **Loaded** — nothing: in team mode the trajectory goes to your own log, `trajectories/<who>.md`, appended at every close{{else}}- **Loaded** — the trajectory block (below){{/if}}

## The trajectory block

The start procedure emits it; the close procedure fills in `missed:`. Fenced, exactly these keys, so it can be grepped:

```text
trajectory: YYYY-MM-DD — <the task, in a few words>
  capsule: capsules/<name>.md
  adrs:    0006, 0009
  source:  src/one.ts, src/two.ts
  also:    STATE.md, traps.md
  missed:  —
```

`missed:` is the field worth the trouble: what the task turned out to need that the map did not point at. It is the only evidence for *why did the agent miss X*, and it can only be written in hindsight.

## Archiving

Once a note's content is durable, promote it — trap to `traps.md`, orientation to a capsule, decision to a decision record — then move the file to `archive/`. The lint skips that folder.
