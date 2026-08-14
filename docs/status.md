# Status

**Last updated:** 2026-08-14
**Current milestone:** 2+3 (merged) — pipeline complete and running on the real
roster; **awaiting the user's evaluation-checkpoint verdict** on the top-10 teams

---

## State

**Milestones 0 and 1 complete** (see session log and git history).

**Milestone 2+3 (merged) — code complete, ⭐ checkpoint pending.** The merge was
confirmed at /plan on 2026-08-14 and implemented the same day.

Data verification (the real export, 149 rows, read end to end):

- 49-column layout recorded verbatim in `reference/data-sources.md`; parser
  asserts it and fails loudly on drift.
- **IVs are exact** — no ranges anywhere; `IvRange` dropped from the design
  (parser errors loudly if `Level Min ≠ Level Max` ever appears).
- **The export carries no moves** (all three move columns empty in all rows) —
  decision: score assuming PvPoke's ranked movesets; the report lists them as
  TM targets with Elite TM flags. Real movesets deferred to Milestone 4's
  appraisal pass.
- Rescans merge in place (no duplicates); a league block is empty iff current
  CP exceeds that league's cap; Poke Genie's per-league blocks are its own PvP
  analysis and serve as a free cross-check oracle.

Pipeline (all stages, 66 tests green):

- `src/roster.ts` — loud-failing 49-column parser; duplicate assert; tracked
  17-row fixture at `fixtures/roster-sample.csv`.
- `src/resolve.ts` — (dex, form, shadow) → speciesId; family expansion along
  gamemaster `family.evolutions` with the GO rule that evolution never changes
  regional form. Oracle: expansion covers Poke Genie's own GL target for all
  149 rows.
- `src/viability.ts` — top-100 meta filter + CP-cap feasibility at the
  current-level floor (levels cannot go down); best specimen per target
  species. Real roster: 260 candidates → 41 viable, 23 infeasible.
- `src/sim/harness.ts` — headless Battle.js in one vm context (shims recorded
  in data-sources.md). **Validated: reproduces published leads matchup ratings
  exactly.** Per-sim cost measured **~0.45 ms** (0.18 ms in bulk) — the last
  Milestone 0 open question, closed; brute force confirmed.
- `src/matrix.ts` — 41 × 100 × 3 = 12,300 sims in 2.2 s, cached on disk keyed
  by (gamemaster, builds, meta, scenarios); cache hit verified on rerun.
- `src/score.ts` — five components (coverage, threat, shared-weakness, roles,
  consistency) aggregated as a weighted geometric mean; every tunable in one
  `ScoreConfig`. Pure and unit-tested without the simulator.
- `src/report.ts` + CLIs — `npm run candidates` (stage-3 eyeball checkpoint),
  `npm run optimize` (full run → `out/teams.md`, tracked for phone access).

Real-run result: top-10 teams dominated by **Shadow Sableye (10/10) +
Clefable (9/10)** + a rotating third; scores ~81.4–81.8.

Cross-validation in the browser (PvPoke Team Builder, teams #1 and #6): the
generated share links load the exact custom builds (IVs, levels, movesets);
PvPoke's threat lists agree with our unanswered-threat lists; grades were
B/B/B/A (team 6) and B/D/B/A (team 1).

## Next action

**The ⭐ evaluation checkpoint — user verdict required:** would you actually
bring these teams? Observations queued for the tuning conversation:

1. **No bulk component.** PvPoke grades team #1's bulk **D** (Charjabug +
   Sableye fragility); our scorer cannot see that. Candidate fix: a stat-product
   component, or shield-pressure proxy.
2. **Coverage is too linear.** Team #6 has 3 unanswered threats, team #1 has
   9, yet #1 scores higher — best-rating averaging barely separates them.
   Candidate fix: sigmoid around 500 and/or an explicit hard-loss penalty.
3. **Presentation diversity.** The top 10 is one core ×8 variants. Consider
   best-team-per-core or an appearance cap when reporting.

After the verdict: tune scoring here (iteration is free — matrix is cached),
then Milestone 4.

## Decisions made

- **League:** Great League (1500) first. Other leagues deferred to Milestone 5.
- **Language/stack:** Node + TypeScript, CLI only.
- **Simulator:** vendor and drive PvPoke's `Battle.js`; do not reimplement.
- **Search strategy:** brute-force C(n,3) — confirmed by measurement.
- **Scanning strategy:** two-pass — broad detail-page scan first, appraisal only
  on the shortlist the optimizer surfaces.
- **M2+M3 merged** (2026-08-14, confirmed at /plan): scan cost was already sunk.
- **Movesets:** score assuming PvPoke ranked movesets (the export has none);
  real moves recorded by hand in Milestone 4.
- **Meta weighting:** opponent weight ∝ PvPoke overall score until real usage
  data (Milestone 5); shield scenarios weighted 0.30/0.50/0.20.
- **Level cap 50** (no best-buddy 51) — PvPoke defaults.

## Open threads

- **Evaluation verdict + scoring tuning** (see Next action).
- Poke Genie: does the app hold movesets in-app at all? (open-questions.md)
- `mew` prefix search semantics — cosmetic only, still open.
- Appraisal-state persistence while swiping — matters for Milestone 4.

## Session log

- **2026-08-14 (d)** — /plan confirmed the M2+M3 merge; implemented the whole
  merged milestone in one session. Verified the real CSV (three surprises: no
  moves, exact IVs, per-league analysis blocks) and recorded it; rewrote
  roadmap; fixed `.gitignore` anchoring (`/data/`) and moved the CSV to
  `data/`. Built roster→resolve→viability→harness→matrix→score→report;
  harness reproduces published ratings exactly; per-sim cost 0.45 ms (last M0
  question closed). Real run: 149 → 260 → 41 viable → 10,660 teams. Team
  Builder cross-check in the browser validated links and threat agreement.
  M1 observations recorded (full list pastes untruncated; "Show evolution
  line" toggle explains pre-evolutions in the box). 66 tests. Awaiting the
  user's checkpoint verdict.
- **2026-08-14 (c)** — User bought Scan Pro and scanned the whole filtered box
  the same day (ahead of the roadmap's M2-before-M3 sequencing); real CSV
  exists. Repo published to GitHub (private,
  `jscarlataS/pogo-team-optimizer`); commits rewritten to the user's new
  identity; `out/gl-search-strings.md` tracked for phone access. Added `data/`
  (gitignored) as the roster-CSV drop point; fixed CLAUDE.md's stale vendor
  path. Proposed M2+M3 merge recorded above for the next /plan.
- **2026-08-14 (b)** — Milestone 1 implemented. git init (baseline commit of
  docs/skills; vendor untracked). Scaffold: TS strict/NodeNext, tsx, vitest, no
  runtime deps. `src/data/pvpoke.ts` (narrow, loud-failing loaders),
  `src/species.ts` (speciesId → {dex, baseName}; aliasId follow, paren strip,
  dex dedupe, overrides hook + non-letter warning), `src/searchString.ts`
  (greedy chunker), `src/cli/species-list.ts` (`--top/--chunk-chars/--format/
  --out`). Verified before writing: aliasId direction (duplicate entry carries
  the pointer, e.g. `lanturnw.aliasId = "lanturn"`), trap entries, gamemaster
  `timestamp` format. Learned: top 100 = 78 shadow-stripped ids but **73 by
  dex** (Ninetales/Stunfisk/Gourgeist forms merge) — docs updated; current
  top-100 names are all plain A–Z (no punctuation/space cases yet); Lanturn
  itself is outside the current top 100. Awaiting the user's in-game tests.
- **2026-08-14** — Milestone 0 done. Vendored PvPoke (`e5ee9b7672`); verified
  rankings/gamemaster/simulator shapes by reading files and ranker code. Learned:
  matchup arrays are ≤5 wins + 5 losses, so rankings JSON cannot replace the
  simulator; scenario table and geometric-mean claims in the docs were wrong (now
  corrected); GL rankings pre-exclude ineligible species; GL top 100 = 78 base
  species. Docs updated (`data-sources.md`, `open-questions.md`,
  `architecture.md`, `pvp-domain.md`). Next: Milestone 1 per agreed plan.
