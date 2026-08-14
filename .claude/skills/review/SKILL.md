---
name: review
description: Review the session's work on the Pokémon GO team optimizer and update project docs. Invoke explicitly at the end of a work session.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
disable-model-invocation: true
---

Review the work from this session.

## Code review

- Does it do what the plan said? Note anything that drifted.
- Any place where a data field name, JSON key, or CSV column was assumed rather than
  observed? Flag each one — this is the failure mode most likely to bite this project.
- Error handling on the ingest path: duplicates, unresolved species, missing moves,
  IV ranges vs exact IVs.
- Are scoring weights centralised and named, or scattered as magic numbers?
- Anything that quietly reimplements simulation logic that PvPoke already provides?

## Correctness check specific to this project

If the change touches scoring or team selection, sanity-check the output rather than
just the code. Pick one recommended team and reason about whether it is actually
sensible: does it have a plausible lead, safe swap and closer? Does it share a
weakness across all three? Compare against `docs/reference/pvp-domain.md`.

A pipeline that runs cleanly and outputs bad teams is the failure mode that matters
here. Passing tests is not evidence of a good scoring function.

## Doc hygiene — do this every time

1. Update `docs/status.md`: current milestone, what changed, what was learned, what
   is next. Append a short session-log entry.
2. Update `docs/reference/open-questions.md` for anything resolved or newly discovered.
3. Correct `docs/architecture.md` or `docs/reference/data-sources.md` wherever this
   session showed them to be wrong.

## Be direct

If the approach is wrong, say so plainly rather than suggesting minor improvements
around a bad design. If something I asked for turns out to be a bad idea now that the
real data is visible, say that too.
