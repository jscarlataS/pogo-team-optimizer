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

- [x] Ingest the verified 49-column CSV (loud-failing parser, dedupe assert,
      tracked 17-row fixture)
- [x] Species resolution + family expansion: each owned mon → every GL-ranked
      family member, IVs carried through (the box is mostly pre-evolutions);
      oracled against Poke Genie's own targets on all 149 rows
- [x] Viability filter, including CP-cap feasibility at the current-level floor
      (levels cannot go down)
- [x] Headless Battle.js harness: reproduces published leads matchup ratings
      **exactly**; per-sim cost measured **~0.45 ms** — last Milestone 0 open
      question closed, brute force confirmed
- [x] Matchup matrix: candidates × top-100 meta × 3 shield scenarios, cached on
      disk keyed by (gamemaster, builds, meta, scenarios) hash
- [x] C(n,3) team search + component scoring, every weight in one config object
- [x] Report with score breakdowns, coverage gaps, in-game search strings,
      Team Builder links, build costs — **restructured into three resource
      tiers on user request**: optimal / budget (≤N levels per member, no XL)
      / ready-now (current form at current level, zero investment; builds
      must reproduce the scanned CP exactly)

**Then stop and evaluate — still the highest-value checkpoint in the project.**
Would I actually bring these teams? Compare two or three against PvPoke's Team
Builder grades. Obviously wrong teams mean the scoring function is wrong — fix it
here, where iteration is free. Do not skip past this because the pipeline "works".

**Done when:** one command reads `data/poke_genie_export.csv` and prints the
top-10 GL teams with score breakdowns; per-sim cost is measured and recorded; the
matrix cache demonstrably hits on rerun; the evaluation verdict is in `status.md`.

---

## Milestone 4 — Shortlist refinement — RE-SCOPED, closed (2026-08-14)

Both halves of the original plan dissolved on contact with reality:

- **The exact-IV appraisal pass is unnecessary.** The Scan Pro export already
  carries exact IVs for every scan (verified in M2+3) — there is no precision
  gap for an appraisal pass to close.
- **The hand-recorded-moveset pass is declined (user decision).** Real moves
  are manual either way: the export's `Quick Move`/`Charge Move`/`Charge
  Move 2` columns are present but empty, and automating against the game
  client is forbidden by hard constraint 1. Not worth a dedicated pass — the
  tool keeps scoring with PvPoke's ranked movesets and reporting multiple top
  teams with costs; the user filters against reality themselves.

What replaces it, already in practice:

- **Opportunistic move corrections.** When the user states a mon's actual
  moves in conversation, analysis uses them (session (f): Dewgong's owned
  legacy moves changed cost advice; Altaria Moonblast-vs-Flamethrower was
  simulated both ways and changed the recommendation). Fold into a small
  tracked overrides file if these accumulate.
- **Poke Genie in-app move entry — considered and declined (2026-08-14).**
  In-app entry could, if it flows into the export's move columns, make
  ingestion automatic — but it is still per-mon typing, and the user judged
  it not worth it: recording current moves would also *narrow* the search,
  since moves are TM-changeable anyway. Ranked-moveset scoring with
  itemised TM/Elite-TM costs is the deliberate model, not a stopgap.
  (Whether in-app entry populates the export was never tested; the minimal
  test is preserved in `reference/open-questions.md` in case this is ever
  revived.)

---

## Milestone 5 — Sharpening — ACTIVE NEXT (/plan target)

Promoted by user request (2026-08-14): **Ultra League first**, then Master.
The touchpoint list below was verified accurate at implementation (2026-08-14),
with one correction: "the matrix cache already keys on every input that
changes" was **wrong** — the league cap was missing from the key even though
opponent default builds derive from it; fixed by adding the cap to the key.
It was wrong a second way, found 2026-08-25: the key hashed
`ranking.moveset` rather than the moves the build actually carries. Those
coincide everywhere in the app, but a moveset what-if (is Lugia's Aeroblast
Elite TM worth it?) builds the same specimen with different moves and every
variant collided on one cache entry — 20 movesets, one identical score. The
key now hashes the build's own move ids; the cache-hit guard still only
length-checks, which is why the collision returned silently.
Original touchpoints, all done: `PvpokeSim` `setCP(1500)`;
`selectReadyCandidates` 1500 cap; `loadRankings1500`; GL-only `species-list`;
GL report/tier labels; plus the Team Builder URL's hardcoded `/all/1500/`.
Master expectation: XL-legendary territory — "ready now" will be thin and the
valuable output is investment advice.

Roughly in value order (Ultra/Master promoted to the top by the user):

- [x] Ultra League (2026-08-14) — `League` value threaded through the stack,
      `--league great|ultra` on all four CLIs; harness at 2500 reproduces
      published UL matchup ratings **exactly**; family expansion agrees with
      Poke Genie's `Name (U)` oracle on every export row; UL report
      (`out/teams-ultra.md`) + UL search strings (`out/ul-search-strings.md`,
      with a new-species-only section for the additive scanning pass).
      Awaiting the user's field verdict.
- [ ] Master League — mostly plumbing now (rankings-10000 verified present,
      405 entries, same shape; extend the `League` table), but "ready now",
      budget, and XL costing semantics need their own pass
- [ ] Scoring-tuning items carried from the ⭐ checkpoint (see status.md):
      bulk component, coverage linearity, viability-cutoff width, per-core
      presentation diversity
- [ ] "What should I invest in?" output — which unowned Pokémon, second charged move
      unlocks, or XL candy investments would most improve the best achievable team
- [ ] Meta frequency weighting from real usage data rather than uniform weights
- [ ] Cup / limited formats (the `groups/` definitions in the PvPoke repo)
- [ ] Team ordering recommendations (which member leads) rather than just the set

---

## Deferred

- 6-Pokémon tournament formats (C(n,6) needs a metaheuristic, not brute force)
- Web UI
- Anything resembling live battle assistance
