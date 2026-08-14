---
name: plan
description: Plan the next milestone of the Pokémon GO team optimizer, scoped to one milestone only. Invoke explicitly at the start of a work session before any implementation.
allowed-tools: Read, Grep, Glob
disable-model-invocation: true
---

Plan the next chunk of work on this project.

## Before planning

1. Read `CLAUDE.md` if not already in context.
2. Read `docs/status.md` — this is the source of truth for where the project is.
3. Read `docs/roadmap.md` and identify the current milestone.
4. Read `docs/reference/open-questions.md` and note which open items this milestone
   depends on.

## Scope

$ARGUMENTS

If no argument was given, plan **only the current milestone** from `status.md`.

Do not plan ahead into later milestones. The roadmap is ordered deliberately — the
expensive manual data-collection step is deferred until the pipeline is validated on
synthetic data, and pulling work forward defeats that.

## What the plan must contain

- The concrete steps, in order
- **Which open questions must be resolved first**, and how you will resolve each one
  (which file to open, what to test). If a step depends on an unverified fact, say so
  explicitly rather than assuming a value.
- What "done" looks like for this milestone, stated as something observable
- Anything in the docs you believe is wrong or underspecified — say so now, not later

## Do not

- Write or edit code. Planning only.
- Propose building the web UI, other leagues, or 6-Pokémon formats. Those are
  explicitly deferred.
- Invent data field names to make a plan look complete. An unknown is a plan item.

End by asking me to confirm or adjust before any implementation starts.
