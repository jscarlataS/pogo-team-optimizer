# Status

**Last updated:** 2026-08-25 (session j)
**Current milestone:** 5 — UL rerun on a +104-scan roster
(`data/poke_genie_export_ul_updated.csv`, 378 scans, almost all ≥1504 CP —
legendaries and second-move UL fodder) plus a **favourite-mon constraint**:
best UL teams that must field the user's shiny Lugia. Headline: the roster's
ready-now UL best is unchanged at **Swampert+Togekiss+Melmetal 81.0**; the
wide-pool ceiling rises 82.2 → **Empoleon+Clefable+Primeape 82.6**; and
**Lugia costs only 1.4 points** — **Swampert+Melmetal+Lugia 79.6**, zero dust,
because the CP2478 L24 specimen is already at its cap-optimal level (Poke
Genie agrees: 0 dust, 0 candy). Four loud parser failures on the new data,
all resolved by observation, plus a real cache-identity bug found by the
Lugia moveset what-if.

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
- **The export carries essentially no moves** (all three move columns empty in
  all 149 rows here; 2 of 378 rows carry a partial set in the 2026-08-25
  export) — decision: score assuming PvPoke's ranked movesets; the report
  lists them as TM targets with Elite TM flags. Ranked-set scoring is
  permanent policy (see Decisions), so the odd populated row changes nothing.
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
  by (gamemaster, cap, builds incl. their actual move ids, meta, scenarios);
  cache hit verified on rerun. The move-id part of the key was added in
  session j — see the roadmap's cache-key note.
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

1. **User: field verdict** on the UL teams — the ready-now
   Swampert+Togekiss+Melmetal (81.0, free) and the Lugia build
   Swampert+Melmetal+Lugia (79.6, free). Open question for the user only:
   **which of the four Lugia is the shiny** — the export has no shiny column,
   so all four were priced separately (see session j).
2. **Promote the wider viability pool to the default.** Four independent runs
   now say top-100 is too narrow (sessions f, h, i, j). Session j adds the
   cleanest case yet: Lugia is UL **#158**, invisible at the default, and the
   whole favourite-mon request is unanswerable without `--viability-top 600`
   (which also lifts the UL optimal ceiling 82.2 → 82.6). Proposal stands:
   default 100 → 600 (UL cost ~27 s cold, matrix cached after).
3. Still open from (h): Master League — where Lugia actually belongs — or the
   scoring-tuning items below.

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

- **Scoring tuning** — observations 1–4 above (bulk component, coverage
  linearity, viability-cutoff width, presentation diversity); fold into a
  later M5 chunk. New UL-relevant knob: `--pool-depth`-style widening was
  agreed (top-100 default kept + flag) — the flag itself is `--viability-top`
  on optimize/candidates, already present.
- Poke Genie in-app move entry — **declined by the user (2026-08-14)**: too
  much hassle, and pinning scoring to current moves would narrow the search
  since moves are TM-changeable. Ranked-set scoring + itemised TM costs is
  deliberate permanent policy (closed in open-questions.md).
- **Roster default path — RESOLVED 2026-08-14 (g)**: CLIs default to the
  newest `.csv` in `data/` with a loud log line (and a warning when mtimes
  are near-identical, e.g. right after a bulk copy); `--roster` overrides.
  Both existing files kept.
- Confirmed real movesets so far (use in analysis; candidates for a tracked
  overrides file): Dewgong has Ice Shard + Icy Wind; Altaria has Sky Attack +
  Moonblast (keeps Moonblast deliberately); Talonflame assumed to have
  Incinerate (fielded main).
- `mew` prefix search semantics — cosmetic only, still open.

## Session log

- **2026-08-25 (j)** — **UL rerun on +104 scans; best teams that must field
  Lugia.** New export `poke_genie_export_ul_updated.csv` (378 rows, 49-column
  layout unchanged, no rows removed or changed; every addition ≥1504 CP, so
  **Great League is provably unaffected** — regenerated GL reports differ only
  in the pipeline header and the over-cap list). Four new-data surprises, all
  resolved by observation first: (1) Poke Genie `Form` value `Aria`
  (Meloetta); (2) `Form` = `Normal` is **ambiguous** for six legendaries whose
  gamemaster line ships a second released forme (Thundurus, Landorus, Kyurem,
  Palkia, Dialga, Mewtwo) — PG names the alternate forme explicitly, so
  `Normal` is always the base one, confirmed row by row against each scan's
  own `Name (U)`; six `RESOLVE_OVERRIDES` entries, since no tag separates the
  pairs; (3) `Sirfetch’d` uses a typographic apostrophe where the gamemaster
  has ASCII — resolution is by dex so it was never at risk, but the PG-target
  cross-checks in `report.ts` and the oracle test compare names, so they now
  go through `sameSpeciesName()`; (4) **two rows now carry movesets**
  (Magmortar, Rookidee), falsifying "empty in every row" — no behaviour
  change, ranked-set scoring is standing policy. 85 tests green.
  Results — default pool (52/7/27): optimal **Feraligatr(S)+Annihilape+
  Clefable 82.2**, budget **Moltres(G)+Swampert+Melmetal 81.2** (21k dust),
  ready **Swampert+Togekiss+Melmetal 81.0** — all three unchanged from (h)
  despite 104 new mons, because the additions are legendaries that sit outside
  the UL top 100. At `--viability-top 600` (168/43/127) the optimal ceiling
  rises to **Empoleon+Clefable+Primeape 82.6** (7 unanswered).
  **Lugia (UL #158, Shadow #360):** all four owned specimens priced separately
  — viability keeps only the best stat-product specimen per species, and the
  export has no shiny flag, so the dedupe was bypassed. Ready-now
  **Swampert+Melmetal+Lugia 79.6** (9 unanswered, **zero dust** — the CP2478
  L24 11/12/15 specimen is already at its cap-optimal level, which Poke
  Genie's own dust column independently confirms at 0/0); the two L20 regulars
  reach 79.4/79.5 for 20,500 dust + 19 candy; Shadow Lugia 78.5 for 37,204
  dust + 38 candy. Optimal tier: **Clefable+Primeape+Lugia 80.7** with only
  **5 unanswered threats** (fewer than the unconstrained 82.6's seven — scoring
  observation 2 again), but Clefable and Primeape are both XL and Primeape
  needs two Elite TMs. **Aeroblast is an Elite TM and is worth ~0.7**: ready
  tier 79.6 with Dragon Tail+Aeroblast+Fly vs **78.9** with Dragon Tail+Fly+
  Future Sight (best non-elite set), though the hole count goes 9 → 12.
  **Cache-identity bug found and fixed:** `matrix.ts`'s key hashed
  `v.ranking.moveset` instead of the moves the build actually carries. The two
  coincide everywhere in the app, so nothing shipped was wrong — but the
  moveset what-if built one specimen 20 ways and every variant collided on a
  single cache entry (the hit guard only length-checks), returning 20
  identical scores. Key now hashes the build's own move ids; all four reports
  regenerated **byte-identical**, confirming the change touches cache identity
  only. `out/teams-ultra-wide600.md` and `out/teams-ultra-lugia.md` added to
  the tracked set.
- **2026-08-24 (i)** — **GL rerun on +29 near-1500 scans; "different team"
  request answered.** New export `poke_genie_export_updated_gl.csv` (274 rows,
  49-column layout unchanged, no rows removed or changed). 83 tests green
  before touching anything. Rank lookup on the 29 additions: **only Azumarill
  (GL #21, 14/15/15 CP1496 L36.5) falls inside the top-100 pool**; the rest
  land 191–3134 (Machamp(S) 191, Nidoqueen 209, Machamp 229, Starmie 230,
  Ursaring(S) 255, Victreebel 259, Mew 349, Raichu(A) 415, Togedemaru 425 …).
  Default run therefore barely moved: pools 43/15/26, optimal still
  Sableye(S)+Clefable+Charjabug 81.8, budget still Corviknight+Clefable+
  Hydreigon 80.7, ready still Altaria+Clefable+G-Fisk 79.7 (Azumarill's only
  showing was ready #6). Re-ran at `--viability-top 600` (pools 115/56/71,
  247k/28k/57k teams, 14 s): optimal ceiling rises to
  **Clodsire+Sableye(S)+Abomasnow(S) 82.2** with only 4 unanswered threats.
  Then enumerated all 57,155 ready teams and filtered by overlap with the
  fielded trio *and* by Elite-TM cost (`eliteMoves`/`legacyMoves` ∩ ranked
  moveset, same rule report.ts uses). Findings: current team ranks #2 overall;
  best disjoint = Ninetales+Azumarill+Scrafty 79.5 / 8 holes but **Ninetales
  needs Ember + Energy Ball, two Elite TMs** (verified in gamemaster); best
  disjoint Elite-TM-free = Azumarill+Gliscor(S)+Raichu(A) 77.9 / 6 holes /
  consistency 86, with Azumarill+Gliscor(S)+Togedemaru 78.4 / **5 holes** but
  consistency 66 (swingy — the shield-scenario spread is wide). Confirms
  scoring observation 2 again: several ≤6-hole teams score *below* 10-hole
  ones (Abomasnow(S)+Poliwrath+Victini: 4 holes, consistency 97, only 76.9).
  Azumarill, Gliscor(S), Raichu(A), Togedemaru, Nidoqueen and Scrafty all have
  **no elite/legacy moves at all**, so those teams are pure dust plays.
  `out/teams.md` regenerated (default pool, --teams 10) and
  `out/teams-wide600.md` added to the tracked set for phone access.
- **2026-08-14 (h)** — **UL rerun on the completed roster.** User scanned the
  UL pass and re-exported (245 scans, +87). The loud-failure design earned
  its keep: four new-data surprises, all resolved by observation first —
  (1) gamemaster ships four dangling `family.evolutions` ids (three unshipped
  shadow evolutions + the `lycranroc_dusk` typo; whole-file scan recorded in
  data-sources.md) — expansion now skips exactly those
  (`KNOWN_DANGLING_EVOLUTIONS`), anything else still throws; (2–3) new Poke
  Genie Form values `Origin`/`Altered` (both Giratina formes scanned) and
  `10%` (Zygarde) — first real entries in `RESOLVE_OVERRIDES`; the oracle
  test gained a dangling-aware fallback (shadow Scyther's PG target is
  Kleavor, reachable only via the missing `kleavor_shadow`). 83 tests green.
  Results: UL pool 27 → 52; optimal **Feraligatr(S)+Annihilape+Clefable
  82.2** (Rage Fist Annihilape from Primeape); budget no longer skipped —
  **Moltres(G)+Swampert+Melmetal 81.2** for 21k dust with only 3 unanswered
  threats; ready-now jumped 78.5 → **Swampert+Togekiss+Melmetal 81.0** (all
  three ~CP2490 as scanned). Giratina(A) CP2493 lands at UL #32 already at
  its optimal level (ready #2 at 80.7); Zygarde 10% correctly invisible
  (rank 634). GL regenerated: pools 43/15/26, budget #1 now
  Corviknight+Clefable+Hydreigon 80.7, optimal/ready unchanged.
  ul-search-strings regenerated: 41 of 70 UL species remain unscanned
  (presumably unowned). Awaiting UL field verdict.
- **2026-08-14 (g)** — **New machine + Milestone 5 chunk 1 (Ultra League).**
  Repo found freshly moved to WSL2 with no Node/vendor/node_modules; installed
  Node 24.19 LTS user-locally (`~/.local/node`, symlinks in `~/.local/bin`),
  ran `scripts/setup.sh` (npm ci + PvPoke re-vendored at the pin), 74 tests
  green before touching code. /plan verified UL data by observation first:
  rankings-2500 = 841 entries, same shape (new finding: matchup entries carry
  an optional `opRating` in ALL league files — docs corrected); `(U)` block
  emptiness rule exact on the real export (7 rows > 2500 CP = the 7 empty
  U-blocks); found the roadmap's "cache keys on every input" claim wrong (cap
  missing from the key). Implemented: `League` value + `loadRankings(league)`;
  cap through `PvpokeSim`, viability, matrix key, Team Builder URLs, report
  labels; U-block parsing; `--league` on all four CLIs; newest-CSV roster
  default (user-confirmed) with near-tie mtime warning; `toLocaleString`
  pinned to en-US (old macOS locale grouped digits differently — tracked
  reports no longer churn across machines). Validation: harness at 2500
  reproduces published UL leads ratings **exactly**; UL family-expansion
  oracle green on all 151 U-block rows; GL regression byte-identical modulo
  the locale fix + one renamed heading; 81 tests. UL run (pools 27/2/14):
  optimal **Feraligatr(S)+Clefable+Melmetal 82.0** (the CP2489 second
  Melmetal is already at its optimal level), ready-now
  **Swampert+Clefable+Melmetal 78.5** (CP2495 Swampert as-is), budget tier
  skipped honestly (2-member pool — UL optima are XL builds). New finding for
  search strings: UL top-100 contains **Kommo-o**, the first non-plain-letter
  name (warning surfaced + regression-tested). `out/teams-ultra.md` and
  `out/ul-search-strings.md` (54 of 70 species unscanned → additive scan
  pass) written and tracked; caches verified hitting on rerun. Docs synced;
  setup.sh now explains how to get Node; CLAUDE.md stack line updated.
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
