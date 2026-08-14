# Status

**Last updated:** 2026-08-14
**Current milestone:** 2+3 **CLOSED — ⭐ checkpoint verdict positive**: the
user adopted the recommended Altaria+Clefable+Stunfisk(G) team (keeping
Moonblast on Altaria, a deliberate 79.5-vs-79.7 trade) and reports it
performing very well in GBL. M4 re-scoped away by user decision (roadmap).
**Next: /plan Milestone 5 — Ultra League first** (touchpoints in roadmap).
Current roster file: `data/poke_genie_export_updated.csv` (158 scans) — the
CLIs still *default* to the older `poke_genie_export.csv`; pass `--roster`.

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

Real-run result: top teams dominated by **Shadow Sableye + Clefable** + a
rotating third; scores ~81.4–81.8.

**Resource tiers (added on user request after the first report):** the CLI now
reports three tiers — *optimal* (no constraints), *budget* (each member ≤
`--max-levelup` levels of power-up, default 5, no XL; same matrix, filtered
pool), and *ready now* (current form at current level, zero investment; own
builds via the harness's `exactLevel` mode + own cached matrix). Ready-now
builds must reproduce the scanned CP exactly — a live cross-check of species
resolution and vendored base stats against the game, passing for all 149 rows.
Real run (updated CSV, post weakness-threshold fix): pools 41/14/25; headline
teams **Sableye(S)+Clefable+Charjabug 81.8** (optimal),
**Fearow+Clefable+Stunfisk(G) 80.7** (budget), **Altaria+Clefable+Stunfisk(G)
79.7** (ready now — two of the three are mons the user already fields).

**Weakness-component bug found and fixed (session f):** the vendor's type
multipliers are float32, so neutral dual-type matchups compute as
1.6 × 0.625 = 1.0000000149 — strictly > 1 — and the scorer counted them as
weaknesses (phantom double/triple penalties on many teams). Threshold is now
1.1 (`WEAKNESS_THRESHOLD`, regression-tested); the fix reordered the budget
and ready tiers. All scores reported before session (f) carried this noise.

**New CLI `npm run rate` (session f):** score a hand-picked team — or profile
individual mons — against the meta using the FULL rankings (no top-100
cutoff), so off-meta picks are gradeable. `--build ready|optimal`,
`--pool-top N` ranks the team against every team the roster can field.
Numbers are directly comparable to the optimize report.

Cross-validation in the browser (PvPoke Team Builder, teams #1 and #6): the
generated share links load the exact custom builds (IVs, levels, movesets);
PvPoke's threat lists agree with our unanswered-threat lists; grades were
B/B/B/A (team 6) and B/D/B/A (team 1).

## Next action

**/plan Milestone 5 — Ultra League** (user request; roadmap lists the code
touchpoints). Scans for UL are additive — the user was advised to never wipe
Poke Genie, only add and delete individually on in-game transfer.

The ⭐ checkpoint is closed (verdict above). The user's stated dust plan:
play Altaria+Clefable+G-Fisk now; build **Shadow Ninetales** (Vulpix L8
14/13/15 → ~67k dust + 50k unlock + 2 Elite TMs) when dust allows — its
Clefable/Zweilous team is the roster's 82.0 no-XL ceiling and patches the
bulky-Water wall every current ready team leaks.

Scoring-tuning observations, queued for M5 (iteration is free — matrix cached):

1. **No bulk component.** PvPoke's Team Builder grades the optimal #1
   (Sableye(S)/Clefable/Charjabug) **D on bulk** — fragile Charjabug +
   Sableye; this scorer cannot see that. Candidate fix: a stat-product
   component, or a shield-pressure proxy.
2. **Coverage is too linear.** Sableye(S)/Mantine/Registeel has 3 unanswered
   threats vs 9 for the #1 team, yet scores *lower* — best-rating averaging
   barely separates hard-loss counts. Candidate fix: sigmoid around 500
   and/or an explicit hard-loss penalty. **More evidence (session f):** among
   the user's fielded 15, Abomasnow(S)/Poliwrath/Gliscor(S) has only 6
   unanswered threats yet scores 77.8, below Crustle/Sandslash(A)/Poliwrath's
   78.4 with 16 unanswered.
3. **Top-100 viability cutoff is too narrow (new, session f).** A top-600
   pool produced a better optimal team than the tracked report (82.0 no-XL
   Ninetales(S)/Clefable/Zweilous vs 81.8 XL-Sableye) and *all* of the
   user's fielded mons rank 121–564. Revisit the default; see
   open-questions.md "Viability threshold".
4. **Presentation diversity within a tier.** The optimal list is one
   Sableye+Clefable core × variants. Consider best-team-per-core or an
   appearance cap when reporting.

Also queued from session (f): the float-noise weakness fix is in (see State);
a candidate follow-up is a cost-aware specimen dedupe (viability keeps only
the best stat-product specimen per species, but an owned, already-built
specimen can beat a cheaper-on-paper rebuild for budget purposes — Greedent
showed this: ready specimen free at 78.4-team vs 44k Skwovet build at 80.0).

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

- **Scoring tuning** — observations 1–4 in Next action; fold into M5.
- Poke Genie in-app move entry — **declined by the user (2026-08-14)**: too
  much hassle, and pinning scoring to current moves would narrow the search
  since moves are TM-changeable. Ranked-set scoring + itemised TM costs is
  deliberate permanent policy (closed in open-questions.md).
- **Roster default path**: CLIs default to `data/poke_genie_export.csv` but
  the current export is `poke_genie_export_updated.csv`. Both are the user's
  files — don't delete; resolve at next /plan (flag default, config, or ask
  the user to rename).
- Confirmed real movesets so far (use in analysis; candidates for a tracked
  overrides file): Dewgong has Ice Shard + Icy Wind; Altaria has Sky Attack +
  Moonblast (keeps Moonblast deliberately); Talonflame assumed to have
  Incinerate (fielded main).
- `mew` prefix search semantics — cosmetic only, still open.

## Session log

- **2026-08-14 (f)** — Checkpoint feedback: user shipped
  `data/poke_genie_export_updated.csv` (+9 scans, their live GBL squad, all
  ~1490–1500 CP) and asked to rate their fielded team and 12 other mons. None
  of the 9 new mons is in the top-100 viability pool (Galvantula is GL rank
  500 of 1143), which is exactly why the optimizer never proposed them. Added
  `npm run rate` (see State). Found/fixed the float32 weakness-threshold bug
  (see State); 74 tests green; out/teams.md regenerated. Findings: user trio
  G-Fisk/Talonflame/Galvantula rates **72.1** (#1884 of 11,480 ready teams);
  swapping Galvantula → their benched Clefable gives 77.5; best fielded-only
  trio Crustle/Sandslash(A)/Poliwrath 78.4; ready-now #1
  Altaria/Clefable/G-Fisk 79.7. Continued in the same session: Dewgong's two
  legacy moves confirmed owned (cost note only — sims already assumed them);
  dust-tier analysis via Poke Genie's own dust figures (best ≤74k total:
  Talonflame+Greedent(Skwovet 12/15/14→L22.5)+Clefable 80.0; ceiling 326k
  no-XL: Ninetales(S)+Clefable+Zweilous 82.0 — beats the top-100-pool
  optimal, evidence the viability cutoff is too narrow); shadow-vs-regular
  Ninetales compared (species-tied #12/#13, shadow flips the bulky Waters —
  named the roster's best long-term dust target); Moonblast-vs-Flamethrower
  simulated on the user's real Altaria (FT better on this exact team,
  79.7/10 losses vs 79.5/13 — user keeps Moonblast for the Elite-TM
  asymmetry, accepts the Corviknight/Empoleon(S) leaks); **user adopted the
  team, reports it performing very well — ⭐ verdict positive, checkpoint
  closed**; UL/ML requested next (export's `(U)` block + vendored
  rankings-2500/10000 verified present); M4 re-scoped away by user decision
  (no manual moveset pass; opportunistic corrections + the PG in-app-entry
  experiment recorded in open-questions.md); docs synced for a clean /plan.
  Post-handoff addendum: the user then declined the PG in-app move-entry
  experiment as well (hassle, and it would narrow the search vs TM-able
  moves) — ranked-set scoring is deliberate permanent policy, not a
  stopgap; question closed, docs updated, follow-up commit.
- **2026-08-14 (e)** — User asked for resource-tiered suggestions. Added
  `exactLevel` builds to the harness, `selectReadyCandidates` (CP-equality
  assert vs the scan) + `filterBudgetCandidates` to viability, tier-structured
  report, and CLI flags (`--max-levelup`, per-tier `--teams`). 73 tests.
  Verdict on the tiered teams still pending.
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
