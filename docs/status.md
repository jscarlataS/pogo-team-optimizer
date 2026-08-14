# Status

**Last updated:** 2026-08-14
**Current milestone:** 1 effectively done (strings used in anger to scan the
box; formal checklist answers still to record) — next: plan the real-data
pipeline (proposed M2+M3 merge, see below)

---

## State

**Milestone 0 complete.** PvPoke vendored at `vendor/pvpoke/` (sparse clone of
`src/data` + `src/js`, commit `e5ee9b7672`, 2026-08-13). All PvPoke data shapes
verified by observation and recorded in `reference/data-sources.md`; the PvPoke
items in `reference/open-questions.md` are resolved except per-simulation cost
(needs Milestone 2's harness to measure).

**Milestone 1 code complete, not yet verified in-game.** Repo is now a git repo
(vendor/ untracked; pinned commit documented in data-sources.md). First code:
Node 20+ / TypeScript / tsx / vitest, zero runtime deps. `npm run species-list`
loads the vendored GL rankings + gamemaster (validating only consumed fields,
failing loudly on drift), collapses the top 100 entries to **73 base species by
dex number** (rank order preserved), and emits chunked comma-separated search
strings (names + dex variants, default 200-char budget) as markdown with the
manual test checklist embedded. Output at `out/gl-search-strings.md`
(regenerable; committed so the chunks are copyable from a phone via GitHub).
21 tests pass, including drift detection pinned to the
vendored commit (1,143 ranking entries; top 100 → 73).

No Poke Genie CSV exists yet — Scan Pro not purchased, no scanning done. This is
intentional: the roadmap defers scanning until after the pipeline is validated on
synthetic data (Milestone 2).

## Next action

Run `/plan`. **Reality jumped ahead of the roadmap on 2026-08-14:** the user
bought Scan Pro and scanned the box using the Milestone 1 search strings — a
real Poke Genie CSV now exists (drop point: `data/`, gitignored). The roadmap
put synthetic validation (M2) before real ingest (M3) only to avoid wasting the
manual scan if the pipeline design proved wrong; that cost is now sunk.

**Proposed re-sequencing, to confirm at the next /plan:** merge M2+M3 — build
ingest against the real CSV (resolving the Poke Genie open questions by reading
the actual file, per the verify-data rule), drive the full pipeline on it, and
run the M2 evaluation checkpoint ("would I actually bring these teams?" +
PvPoke Team Builder comparison) on real data. The hand-written synthetic
fixture shrinks to a small tracked test fixture. Unchanged: the per-simulation
cost measurement still gates the brute-force decision, and the evaluation
checkpoint remains the project's most important gate — do not skip it just
because real data makes the pipeline "work".

**Also before/while planning:** collect the user's in-game observations from
the M1 checklist and record them in `reference/open-questions.md` (the strings
demonstrably worked well enough to scan with, but cap/OR/prefix specifics are
unrecorded).

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

- M1 in-game checklist observations (length cap, OR semantics, `mew` prefix
  behaviour) not yet written into `reference/open-questions.md` — get them from
  the user while memory is fresh.
- Roadmap re-sequencing (M2+M3 merge) proposed but not yet confirmed or
  reflected in `roadmap.md` — decide at next /plan and update the roadmap then.

## Session log

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
