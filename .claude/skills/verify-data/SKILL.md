---
name: verify-data
description: Resolve unverified data shapes by opening the real file rather than inferring. Use whenever about to reference a PvPoke JSON key, a Poke Genie CSV column, or any field listed in docs/reference/open-questions.md, or when the user asks to verify or confirm a data shape.
allowed-tools: Read, Grep, Glob, Bash
effort: high
---

Resolve unverified facts by observation. This skill exists because the project docs
were written partly from inference and partly from third-party sources of varying
quality, and building on the wrong shape is the single most expensive mistake
available here.

## Target

$ARGUMENTS

If no argument was given, work through `docs/reference/open-questions.md` from the
top, prioritising anything the current milestone depends on.

## Method

For each item:

1. **Open the actual artifact.** The real JSON file, the real CSV, the real module.
   Not the documentation about it, not a search result, not your recollection.
2. **Record what you observed**, including exact key names, types, nesting, and any
   surprises (nulls, inconsistent casing, missing entries, truncated arrays).
3. **Note what you could not determine** and why. An honest unknown is a valid result.
4. **Update the docs**: move the item out of `open-questions.md` and write the real
   shape into `docs/reference/data-sources.md`.

## Rules

- Do not resolve an item by reasoning about what a sensible schema *would* look like.
- Do not mark something verified because a blog post or README said so. The
  authoritative source is the file itself.
- If something in the docs turns out to be plainly wrong, say so explicitly in the
  update rather than quietly editing it — I want to know which of my assumptions
  didn't survive contact.
- Empirical items (in-game search bar character limits, whether appraisal state
  persists while swiping between Pokémon) cannot be resolved by reading files. Mark
  them clearly as "requires manual test by user" and describe the minimal test.

## Output

A short report: what was verified, what changed in the docs, what remains open, and
whether any finding invalidates part of `docs/architecture.md`.
