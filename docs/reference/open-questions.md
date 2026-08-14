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
- [ ] **Actual per-simulation cost.** The architecture doc's estimate of "a few ms"
      is an assumption. Static inspection cannot resolve this — measure when the
      Milestone 2 harness first runs, and re-evaluate the brute-force decision if
      it is off by an order of magnitude.

## Poke Genie

- [ ] **Exact CSV column headers and their order.** Known only at the level of "which
      attributes are included." Confirm against a real export from the actual account —
      these have changed between app versions.
- [ ] **How IV ranges are represented in the CSV** when a Pokémon was scanned from the
      detail page without appraisal. Possibly a range, possibly a candidate count,
      possibly blank. This determines the `IvRange` type.
- [ ] **Whether a "Batch Scan" mode exists at all.** Described on third-party SEO sites
      as auto-capturing while scrolling the storage grid, but not substantiated from
      Poke Genie's own materials. If it does exist it substantially changes Milestone 3's
      effort; if it does not, scanning is one Pokémon per screen.
- [ ] **Current pricing and tier naming.** "$9.99 Scan Pro + Remove Ads" is from an App
      Store listing; naming has shifted over the years. Check in-app.

## Pokémon GO client behaviour — requires manual test by user (not resolvable from files)

- [ ] **Search bar character limit** and whether comma-separated species lists behave as
      OR across a long string. Milestone 1's output format depends on this.
      *Minimal test:* paste a 3-name string (`azumarill,medicham,lanturn`), confirm
      OR behaviour; then paste one full Milestone 1 chunk and check for silent
      truncation (does the last species in the string still match?).
- [ ] **Name-match semantics**: whether name search is prefix/substring (e.g. does
      `mew` also match Mewtwo?). Affects how clean the Milestone 1 output is; dex
      numbers sidestep it entirely. *Minimal test:* search `mew` and see what comes back.
- [ ] **Whether appraisal state persists while swiping between Pokémon.** If it does,
      Milestone 4's exact-IV pass is dramatically cheaper than assumed.
      *Minimal test:* appraise one Pokémon, swipe to the next, check whether the
      appraisal overlay stays up.

## Design assumptions worth revisiting

- [ ] **Shield weighting 0.30/0.50/0.20** — adopted from prior art, not independently
      derived. Reasonable default, not gospel.
- [ ] **Viability threshold** (PvPoke score ≥ ~70, or top 100) — arbitrary starting
      point. Check whether it is excluding Pokémon that would make good teams.
- [ ] **Whether IV precision meaningfully changes team selection.** Milestone 4
      produces the empirical answer. If it turns out not to matter, the appraisal pass
      can be dropped from future runs entirely.
