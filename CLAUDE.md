# CLAUDE.md

## What this project is

A CLI tool that answers one question: **given the Pokémon I actually own, what are
the strongest 3-Pokémon teams I can bring to GO Battle League?**

PvPoke already solves the adjacent problems — it ranks Pokémon and it *grades* a team
you hand it. What it does not do is search over a constrained roster. It has no real
roster import and no combinatorial optimizer. That gap is this project.

Input: a CSV export of my scanned Pokémon.
Output: a ranked list of teams, each with a score, its coverage gaps, and an in-game
search string so I can find the members quickly.

## Stack

- Node + TypeScript, run locally (macOS originally; now also WSL2/Linux — `scripts/setup.sh` bootstraps a fresh machine)
- No server, no UI initially — CLI in, JSON/markdown out
- PvPoke's data + battle code vendored into `vendor/pvpoke/` (MIT licensed,
  attribution retained); `data/` holds the user's own Poke Genie CSV exports —
  committed (private repo; the one input no script can regenerate), CLIs
  default to the newest one
- PvPoke's `Battle.js` driven headlessly for simulation rather than reimplemented

## Hard constraints — do not violate these

1. **Never touch Niantic's servers or the game client.** No API calls, no packet
   inspection, no reading the game's local storage, no automation of the game.
   The only ingestion path is a CSV the user exported from Poke Genie themselves.
   This is what keeps the project inside Niantic's ToS; everything else is negotiable.
2. **Do not invent data field names.** PvPoke's JSON shapes and Poke Genie's CSV
   headers are only partially verified — see `docs/reference/open-questions.md`.
   Where a shape is unverified, read the actual file and adapt; do not guess a
   plausible key and build on it.
3. **Do not reimplement the battle simulator.** It is subtle (turn timing, energy,
   baiting, shield logic, buff/debuff application). Vendor PvPoke's and drive it.

## Working conventions

- `docs/architecture.md` — pipeline design, data structures, scoring function
- `docs/roadmap.md` — staged plan; work top-down, don't skip ahead
- `docs/status.md` — current state, updated at the end of each session
- `docs/reference/` — domain facts and data-source details; treat as authoritative
  over your priors, since Pokémon GO's meta and PvPoke's site change frequently
- Commands: `/plan` before non-trivial work, `/implement`, `/review`

## The one thing that matters most

The scoring function is the project. Everything else is plumbing. A team optimizer
that outputs teams I wouldn't actually bring is worthless no matter how clean the
pipeline is. Validate scoring against hand-built teams early and often — see
Milestone 2 in the roadmap.

## Current phase

See `docs/status.md` — it is the source of truth for project state.
