# Roadmap

Work these in order. The sequencing is deliberate: the expensive manual step
(scanning ~100 Pokémon by hand) is placed *after* the pipeline is validated, so that
if the design is wrong it costs an evening of coding rather than an evening of coding
plus three hours of tapping through a phone.

---

## Milestone 0 — Data acquisition and shape verification

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

## Milestone 1 — Species list and in-game search string

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

## Milestone 2 — Full pipeline on synthetic data ⭐

**Goal:** validate the scoring function before investing in real data collection.

- [ ] Hand-write `fixtures/roster-sample.csv` — 20–25 Pokémon believed to be owned,
      with guessed IVs and known movesets. Approximate is fine.
- [ ] Implement stages 1→6 end to end against it
- [ ] Print the top 10 teams with full score breakdowns

**Then stop and evaluate.** Look at the output and ask: *would I actually bring these
teams?* Compare two or three of them against PvPoke's Team Builder grades directly.

- If the teams are obviously wrong → the scoring function is wrong. Fix it here,
  where iteration is free.
- If the teams look right → proceed to Milestone 3.

**This is the highest-value checkpoint in the project.** Do not skip past it because
the pipeline "works" — working and correct are different things.

---

## Milestone 3 — Real roster ingest

**Goal:** replace synthetic data with the actual collection.

- [ ] Purchase Poke Genie Scan Pro (~$9.99 one-time; unlocks both CSV export and,
      on iOS, IVision scanning — same purchase)
- [ ] Paste Milestone 1's search string into the game to filter the box
- [ ] Scan the filtered set — **detail pages only, no appraisal**. Captures species,
      moves, CP, HP. Fast per Pokémon.
- [ ] Export CSV, document the real column headers in `reference/data-sources.md`
- [ ] Implement the real parser: dedupe, handle scan-history semantics, resolve species
- [ ] Support `IvRange` (detail-page scans give candidate IV sets, not exact values)
- [ ] Rerun the pipeline against real data

**Done when:** the optimizer runs on the actual collection.

---

## Milestone 4 — Shortlist refinement

**Goal:** spend precision only where it changes the answer.

- [ ] Identify the 15–20 Pokémon that recur across the top-scoring teams
- [ ] Go back and scan *those* via the appraisal screen for exact IVs
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
