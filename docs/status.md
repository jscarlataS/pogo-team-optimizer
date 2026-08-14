# Status

**Last updated:** 2026-08-14
**Current milestone:** 1 — Species list and in-game search string

---

## State

**Milestone 0 complete.** PvPoke vendored at `vendor/pvpoke/` (sparse clone of
`src/data` + `src/js`, commit `e5ee9b7672`, 2026-08-13). All PvPoke data shapes
verified by observation and recorded in `reference/data-sources.md`; the PvPoke
items in `reference/open-questions.md` are resolved except per-simulation cost
(needs Milestone 2's harness to measure). Three documented assumptions were wrong
and have been corrected — ranking-scenario shields/energy, the "overall = geometric
mean" claim, and (consequently) the role-mapping descriptions.

No code yet. No Poke Genie CSV exists yet — Scan Pro not purchased, no scanning
done. This is intentional: the roadmap defers scanning until after the pipeline is
validated on synthetic data (Milestone 2).

## Next action

Milestone 1: plan agreed → implement the top-100 species list and in-game search
string generator from `rankings/all/overall/rankings-1500.json` +
`gamemaster.json`. Search-bar behaviour (length cap, OR semantics, prefix
matching) is untestable from code — output must be chunked conservatively and the
user does the in-game test (see open-questions.md).

## Decisions made

- **League:** Great League (1500) first. Deepest viable pool, largest meta, most
  PvPoke data — and most likely to already contain something usable in an
  existing collection. Other leagues deferred to Milestone 5.
- **Language/stack:** Node + TypeScript, CLI only.
- **Simulator:** vendor and drive PvPoke's `Battle.js`; do not reimplement.
- **Search strategy:** brute-force C(n,3). No metaheuristic for the 3-slot case.
- **Scanning strategy:** two-pass — broad detail-page scan first, appraisal only on
  the shortlist the optimizer surfaces.

## Open threads

None yet. Log blockers and deferred decisions here as they arise.

## Session log

- **2026-08-14** — Milestone 0 done. Vendored PvPoke (`e5ee9b7672`); verified
  rankings/gamemaster/simulator shapes by reading files and ranker code. Learned:
  matchup arrays are ≤5 wins + 5 losses, so rankings JSON cannot replace the
  simulator; scenario table and geometric-mean claims in the docs were wrong (now
  corrected); GL rankings pre-exclude ineligible species; GL top 100 = 78 base
  species. Docs updated (`data-sources.md`, `open-questions.md`,
  `architecture.md`, `pvp-domain.md`). Next: Milestone 1 per agreed plan.
