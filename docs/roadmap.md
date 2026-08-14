# Roadmap

Work these in order. The sequencing is deliberate: the expensive manual step
(scanning ~100 Pokémon by hand) is placed *after* the pipeline is validated, so that
if the design is wrong it costs an evening of coding rather than an evening of coding
plus three hours of tapping through a phone.

---

## Milestone 0 — Data acquisition and shape verification ✅ 2026-08-14

**Goal:** know exactly what the data looks like before designing against it.

- [ ] Clone or vendor `github.com/pvpoke/pvpoke` into `vendor/`
- [ ] Fetch `src/data/gamemaster.json` — inspect and document the actual Pokémon and
      move object shapes
- [ ] Fetch `src/data/rankings/all/overall/rankings-1500.json` — **open it and record
      the real key names** for the score, moveset, matchups and counters arrays.
      These are listed as unverified in `reference/open-questions.md`; resolve them here.
- [ ] Document findings in `reference/data-sources.md`, replacing the assumptions

**Done when:** the JSON shapes are written down from observation, not inference.

---

## Milestone 1 — Species list and in-game search string ✅ 2026-08-14

**Goal:** first useful output, before any simulation exists.

- [ ] Load Great League overall rankings, take the top ~100 `speciesId`
- [ ] Map `speciesId` → in-game display name (handle forms/regionals)
- [ ] Emit comma-separated search strings for pasting into Pokémon GO's search bar
- [ ] Split across multiple strings if the field has a length cap (unverified —
      test empirically)

**Why first:** this is the tool that makes scanning tractable. It collapses a box of
thousands down to the ~100 that matter. It is also the species-name mapping that
Milestone 2 needs anyway.

**Done when:** pasting the output into the game shows only meta-relevant species.

---

## Milestone 2+3 — Full pipeline on the real roster ⭐ (merged 2026-08-14)

Originally synthetic-data validation (M2) preceded the expensive manual scan (M3)
to protect that investment. The user bought Scan Pro and scanned the box on
2026-08-14, so the cost is sunk; the milestones merged and the pipeline is built
directly against the real CSV (shape verified — see `reference/data-sources.md`).
The synthetic fixture survives only as a small tracked test fixture excerpted from
the real export.

**Decision (2026-08-14): the export carries no moves**, so scoring assumes each
Pokémon runs PvPoke's ranked moveset, and the report tells the user what to TM to.
Actual-move precision is deferred to Milestone 4's shortlist pass.

- [ ] Ingest the verified 49-column CSV (loud-failing parser, dedupe assert,
      tracked ~15-row fixture)
- [ ] Species resolution + family expansion: each owned mon → every GL-ranked
      family member, IVs carried through (the box is mostly pre-evolutions)
- [ ] Viability filter, including CP-cap feasibility at the current-level floor
      (levels cannot go down)
- [ ] Headless Battle.js harness: reproduce one published PvPoke matchup rating,
      then **measure per-sim cost** — closes the last Milestone 0 open question
      and re-tests the brute-force decision
- [ ] Matchup matrix: candidates × top-100 meta × 3 shield scenarios, cached on
      disk keyed by (roster, meta, gamemaster, config) hash
- [ ] C(n,3) team search + component scoring, every weight in one config object
- [ ] Report: top 10 with score breakdowns, meta scorecard, coverage gaps,
      in-game search strings, Team Builder links, build costs

**Then stop and evaluate — still the highest-value checkpoint in the project.**
Would I actually bring these teams? Compare two or three against PvPoke's Team
Builder grades. Obviously wrong teams mean the scoring function is wrong — fix it
here, where iteration is free. Do not skip past this because the pipeline "works".

**Done when:** one command reads `data/poke_genie_export.csv` and prints the
top-10 GL teams with score breakdowns; per-sim cost is measured and recorded; the
matrix cache demonstrably hits on rerun; the evaluation verdict is in `status.md`.

---

## Milestone 4 — Shortlist refinement

**Goal:** spend precision only where it changes the answer.

- [ ] Identify the 15–20 Pokémon that recur across the top-scoring teams
- [ ] Go back and scan *those* via the appraisal screen for exact IVs
- [ ] While there, record their *actual* movesets by hand (the CSV export has
      none) and rerun with real moves instead of assumed ranked movesets
- [ ] Rerun; compare team rankings before and after

The comparison is worth recording: it tells you empirically how much IV precision
actually moves team selection, which informs whether this step is ever worth
repeating.

---

## Milestone 5 — Sharpening

Roughly in value order:

- [ ] Meta frequency weighting from real usage data rather than uniform weights
- [ ] "What should I invest in?" output — which unowned Pokémon, second charged move
      unlocks, or XL candy investments would most improve the best achievable team
- [ ] Ultra and Master League
- [ ] Cup / limited formats (the `groups/` definitions in the PvPoke repo)
- [ ] Team ordering recommendations (which member leads) rather than just the set

---

## Deferred

- 6-Pokémon tournament formats (C(n,6) needs a metaheuristic, not brute force)
- Web UI
- Anything resembling live battle assistance
