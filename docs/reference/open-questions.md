# Open questions

Things that are **not verified**. Each was either inferred, taken from a weak source,
or blocked during research. Resolve by observation before building on them.

The rule: if you need one of these and it is still open, **go read the actual file or
test the actual behaviour**. Do not substitute a plausible-looking guess. A wrong field
name that happens to parse is worse than a crash.

---

## PvPoke data shapes — RESOLVED 2026-08-14

All three resolved by reading the vendored copy (commit `e5ee9b7672`). Full shapes
now live in `data-sources.md`; summary:

- [x] **Exact key names inside `rankings-*.json`** — per entry: `speciesId`,
      `speciesName`, `rating`, `score`, `scores` (6 = leads/closers/switches/
      chargers/attackers/consistency), `moveset`, `moves`, `matchups`, `counters`,
      `stats`; optional `editorScore`/`editorNotes`. Matchup entries are
      `{opponent, rating}`.
- [x] **Matchup array semantics** — confirmed truncated: ≤5 significant *wins*
      (`matchups`, rating > 500) and 5 significant *losses* (`counters`, < 500),
      selected by opponent-rank weighting in `Ranker.js`; the full round-robin is
      deleted before publishing. **So the rankings JSON cannot substitute for the
      simulator, even as a cheap first pass** — stage 4 needs `Battle.js`.
- [x] **`gamemaster.json` shadow/form representation** — every variant (shadow,
      regional, mega, form, some genders) is a separate `pokemon[]` entry sharing
      the base `dex`; `_shadow`/`_alolan`/`_mega` id suffixes, parenthesised
      `speciesName` suffixes, `tags`. Traps recorded in `data-sources.md` (no base
      `giratina` entry; inconsistent gender suffixes; `aliasId` duplicates).

Two assumptions in the old docs did **not** survive contact — the ranking-scenario
table (leads are 1v1 not 2v2, attackers 0v1 not 0v2, switches subject has a 4-turn
energy *advantage*, not a 6-turn deficit) and the "overall = geometric mean"
claim (it is a 12:6:4:2 *best*-category-weighted mean that favours specialists,
editorially blended 75/25 when an `editorScore` override exists). Corrections in
`data-sources.md`; `architecture.md` and `pvp-domain.md` updated to match.

## PvPoke simulator

- [x] **What `Battle.js` needs to run under Node** — RESOLVED 2026-08-14 by static
      inspection: no module system (shared-scope globals); core sim files are
      DOM-free; `Battle.js` needs `InterfaceMaster` only inside `init()` (never
      call it); `GameMaster.js` needs a `$`/`localStorage` shim or a bypassed
      loader; `DecisionOption` comes from `src/js/training/`. Details in
      `data-sources.md`.
- [x] **Actual per-simulation cost** — RESOLVED 2026-08-14 by measurement in the
      merged-milestone harness: **~0.45 ms per `simulate()`** (132-sim benchmark
      in `test/harness.test.ts`, Node 20+, Apple Silicon; the suite re-measures
      on every run and prints the figure). A full ~16k-sim matchup matrix is
      ~7 s, once, then cached. The architecture's "a few ms" estimate was
      pessimistic; brute-force C(n,3) is comfortably confirmed. The same
      harness reproduces published leads matchup ratings **exactly**, which
      validates the headless drive end to end.

## Poke Genie — RESOLVED 2026-08-14 (real export read; two new items below)

Resolved by reading the user's actual export (149 rows, scanned 2026-08-14).
Full verified shape in `data-sources.md`:

- [x] **Exact CSV column headers and order** — 49 columns, recorded verbatim.
- [x] **IV-range representation** — none exists: every row carries exact single
      IVs and `Level Min == Level Max`. The `IvRange` type is unnecessary; parse
      Min/Max and fail loudly if they ever differ.
- [x] **Batch Scan existence** — moot: the box was scanned one-at-a-time on
      2026-08-14; the cost is sunk either way.
- [x] **Pricing/tier naming** — confirmed by purchase: "Scan Pro", $9.99 one-time.

New, discovered in the export:

- [ ] **Moves are entirely absent from the export** — all three move columns
      (`Quick Move`/`Charge Move`/`Charge Move 2`, columns 14–16) are present
      but empty in all 158 rows. Poke Genie allows manual move entry per mon
      in-app; whether that populates these columns on re-export is the open
      question. *Minimal test (requires user):* set the known moves on one
      scanned mon in Poke Genie, re-export, check that row's columns 14–16.
      If they fill, shortlist movesets become a one-time in-app chore and the
      parser can carry them through. Decision 2026-08-14: a dedicated manual
      recording pass is declined regardless (M4 re-scope, see roadmap); until
      this experiment succeeds, scoring assumes ranked movesets and the user
      states real moves ad hoc when they matter.
- [ ] **`Sha/Pur (G/U/L)` semantics** (values 0/1/2/empty; 2 appears only on
      shadows). Not needed by the pipeline; low priority.
- [ ] **Purified encoding in `Shadow/Purified`** — no purified specimen in the
      box; presumably `2`, unobserved.

## Pokémon GO client behaviour — requires manual test by user (not resolvable from files)

- [x] **Search bar length / OR semantics** — RESOLVED 2026-08-14, tested in-game
      by the user: the box was scanned using the chunked name searches, and the
      **full un-chunked list was also pasted and worked — no species silently
      truncated**. Comma separation behaves as OR throughout. No cap was hit at
      this length; the exact limit (if one exists) remains unmeasured and no
      longer matters for Milestone 1's purposes.
- [x] **Evolution-line inclusion** — new observation from the same session: the
      user enabled the game's "Show evolution line" button while scanning, which
      pulls pre-evolutions of matched species into the results. This is why the
      export is full of Dwebbles/Deinos/Marills, and it means search strings do
      not need to name family members explicitly. The pipeline's family
      expansion handles the roster side.
- [ ] **Name-match semantics**: whether name search is prefix/substring (e.g. does
      `mew` also match Mewtwo?). Still untested — now moot for scanning (the
      evolution-line toggle + dex numbers sidestep it); keep open only for
      cosmetic cleanliness of future search strings.
- [x] **Whether appraisal state persists while swiping between Pokémon** — MOOT
      2026-08-14: the export already carries exact IVs and the M4 appraisal
      pass was dropped entirely (roadmap re-scope). Never tested.

## Design assumptions worth revisiting

- [ ] **Shield weighting 0.30/0.50/0.20** — adopted from prior art, not independently
      derived. Reasonable default, not gospel.
- [ ] **Viability threshold** (top 100) — now backed by evidence that it is too
      tight: session (f) found a top-600 pool yields a *better* optimal team
      than the top-100 pool (82.0 no-XL vs 81.8 with XL) and every one of the
      user's fielded mons ranks 121–564. Revisit the default during M5.
- [x] **Whether IV precision meaningfully changes team selection** — MOOT
      2026-08-14: the premise (scan-time IV ranges vs appraisal-exact IVs)
      never materialised; the export's IVs are exact. No precision gap exists
      to measure.
