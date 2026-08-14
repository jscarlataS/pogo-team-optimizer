# Architecture

## Pipeline overview

```
Poke Genie CSV
      │
      ▼
[1] Roster ingest ──────► normalize, dedupe, drop non-owned
      │
      ▼
[2] Species resolution ─► CSV species name → PvPoke speciesId
      │
      ▼
[3] Viability filter ───► per league: can it reach the CP cap? is it ranked?
      │
      ▼
[4] Matchup matrix ─────► owned × meta × shield scenario  (EXPENSIVE — cache)
      │
      ▼
[5] Team search ────────► enumerate C(n,3), score each
      │
      ▼
[6] Report ─────────────► top teams, coverage gaps, in-game search strings
```

Stages 1–3 are cheap and rerun freely. Stage 4 is the only expensive step and its
output is a pure function of (roster, meta list, gamemaster version) — cache it on
disk keyed by a hash of those three.

---

## [1] Roster ingest

Source: Poke Genie "Scan Pro" CSV export. **Implemented in `src/roster.ts`**
against the verified 49-column layout (`reference/data-sources.md`); the
parser asserts the header verbatim and fails loudly on drift.

What the real export taught us (2026-08-14), replacing this section's earlier
assumptions:

- It behaves like a **snapshot**, not raw scan history: rescanning a mon
  updates its row in place. The parser still asserts no duplicate
  (name, form, CP, HP, IVs) key so a semantics change is caught loudly.
  There is still no owned/transferred flag — a mon transferred after
  scanning would linger until the next full export.
- **IVs are exact and `Level Min == Level Max` in every row.** The planned
  `IvRange` type is gone; the parser refuses a range if one ever appears,
  because ranges were never observed and are not modelled.
- **Moves are absent from the export** — see stage 4 for the consequence.

The implemented `OwnedPokemon` (source of truth: `src/roster.ts`) carries
name/form/dex, CP/HP, exact IVs, level (a *floor* for builds — levels cannot
go down), lucky/shadow flags, scan timestamps, and Poke Genie's own
Great-League analysis block (its suggested family target + build costs),
which the pipeline uses as a free cross-check oracle and for cost reporting.

---

## [2] Species resolution

CSV species names will not match PvPoke `speciesId` values directly. Expect friction on:

- Regional forms (Alolan / Galarian / Hisuian / Paldean)
- Shadow variants — PvPoke typically models these as separate ranking entries
- Mega evolutions
- Multi-form species (Castform, Deoxys, Giratina, Therian formes, etc.)
- Gendered forms and cosmetic variants that are *not* separate PvPoke entries

Build the lookup from `gamemaster.json` itself rather than hardcoding a map.
Keep an explicit overrides hook for the handful that won't resolve
automatically, and **fail loudly on unresolved names** — silently dropping a
Pokémon means silently dropping a possibly-optimal team member.

**Family expansion (implemented in `src/resolve.ts`):** the scanned box is
mostly pre-evolutions (Dwebble, Deino, Marill, …), so each owned mon expands
to every family member it can evolve into, IVs carried along, following
gamemaster `family.evolutions` (shadow lineages are pre-wired, e.g.
`dwebble_shadow → crustle_shadow`). One GO rule is enforced on top:
**evolution never changes regional form** — a Kanto Cubone may not become
Alolan Marowak; converging lines with a single untagged form (Paldean Wooper
→ Clodsire, Galarian Mr. Mime → Mr. Rime) are allowed. Poke Genie's own
per-league targets agree with this expansion on all 149 real rows.

---

## [3] Viability filter

Per league (CP cap 1500 / 2500 / 10000):

1. Can this Pokémon reach the cap? (compute CP at max level for its IVs)
2. Is it present in that league's rankings above a score threshold?

Threshold: start at PvPoke overall score ≥ ~70, or simply the top 100 entries.
Tune later. The point is to get `n` down to a workable size before stage 4.
Two verified facts help here: the published GL rankings already exclude
GBL-ineligible species, and the overall `score` is partly editorial for some
Pokémon (75/25 editor blend where an override exists) — acceptable for a coarse
filter, but don't treat it as pure simulation output.

Realistic outcome: a large collection filters down to roughly 30–80 candidates
per league. That is the `n` that drives everything downstream.

Two implemented refinements (`src/viability.ts`): a candidate must also be
**cap-feasible** — the optimal level for its IVs may not be below the mon's
current level, since levels cannot go down (a 1509 CP Crustle has no legal GL
build) — and where several specimens build the same target species, only the
best stat product is kept. Real roster: 260 expanded candidates → 41 viable.
The same module derives the **resource tiers** the report is organised
around: *budget* (optimal build within N levels of current, no XL) and
*ready-now* (current form at current level, zero investment, built with the
harness's exact-level mode — each such build must reproduce the scanned CP
exactly, cross-checking resolution and vendored base stats against the game).

---

## [4] Matchup matrix

The expensive step. For each (owned Pokémon, meta opponent, shield scenario) triple,
run a PvPoke simulation and store the **Battle Rating** (0–1000; >500 is a win).

Approach: vendor PvPoke's `src/js/battle/Battle.js` plus its dependencies
(`GameMaster.js`, `Pokemon.js`, move logic) and drive them from Node. The code was
written for the browser, so expect to stub or shim DOM/globals it touches. It is not
published as an npm package.

Implemented in `src/sim/harness.ts` (one vm context; the exact shims and
driving pattern are recorded in `reference/data-sources.md`, "Headless
driving details"). Validation: the harness reproduces published leads
matchup ratings **exactly**.

Shield scenarios: 0v0, 1v1, 2v2. Prior art (crsiebler/pogo-team-optimizer) weights
these **0.30 / 0.50 / 0.20** respectively — 1-shield weighted highest because it is
the most common real scenario. Adopt as a starting point, expose as config.

Sizing, measured (2026-08-14): **~0.45 ms per sim** (0.15–0.18 ms in bulk).
The real run is 41 × 100 × 3 = 12,300 sims in ~2 s, plus a second
25-candidate matrix for the ready-now tier — trivial. Cached on disk anyway
so scoring iteration is instant.

Cache key: hash of (sorted roster ids + meta list + gamemaster version + sim config).
Invalidate on any change. Store as JSON or a typed array on disk.

**Movesets — reality overruled the original intent here.** The export carries
no move data at all, so simulating "the moveset the user actually has" is
impossible from this input. Decision (2026-08-14, confirmed by the user):
simulate every candidate with **PvPoke's ranked moveset** and treat the
report as the TM shopping list — second-move unlock dust and Elite-TM needs
are itemised per member.

Follow-up decision (2026-08-14, M4 re-scope, finalised same day): the
planned hand-recording pass is dropped and the Poke Genie in-app-entry
ingestion idea was declined too — recording current moves would anchor the
search to today's TMs, when moves are themselves a changeable resource. The
ranked-moveset assumption is deliberate, permanent policy: the report's
TM/Elite-TM cost lines are the bridge between ranked sets and reality, and
user-stated real moves are simmed ad hoc when a specific held moveset
matters (precedent: Moonblast Altaria).

---

## [5] Team search and scoring

### Combinatorics

Teams of 3 from `n` viable owned Pokémon = C(n,3):

| n  | C(n,3) | C(n,6)     |
|----|--------|------------|
| 30 | 4,060  | 593,775    |
| 40 | 9,880  | 3,838,380  |
| 60 | 34,220 | ~50,000,000 |

With the matrix precomputed, scoring one team is table lookups over ~100 opponents —
microseconds. **Brute force C(n,3) is entirely fine.** Do not build a genetic
algorithm for the 3-slot case; it is premature.

C(n,6) for tournament/Premier formats is a different problem — defer it, and when it
arrives use beam search or a GA (see prior art in `docs/reference/data-sources.md`).

### Scoring function

This is the part that determines whether the tool is useful. Components:

**a) Weighted meta coverage.** For each meta opponent, determine the team's best
achievable outcome (the team gets to choose which member leads and which comes in on
the swap — a team beats an opponent if *any* member reasonably can, but with a
penalty for that member being unreachable due to alignment). Weight each opponent by
meta frequency, not uniformly.

**b) Threat score.** PvPoke's own concept, and the closest thing to an established
metric: how many of your team a given threat beats, how decisively, weighted by how
likely you are to face it. Lower is better. Sum across the meta list.

**c) Double-weakness penalty.** A team where all three members share a weakness (the
classic three-Pokémon-all-weak-to-Mud-Shot problem) is fragile in a way per-matchup
scoring underweights. Penalize explicitly.

**d) Role coverage.** A functional team needs a **lead**, a **safe swap**, and a
**closer**. PvPoke's ranking categories map onto these roles: Leads (1v1 shields —
*not* 2v2 as previously written here), Switches (subject at a 4-turn energy
*advantage* with extra weight on hard losses — see the corrected scenario table in
`reference/data-sources.md`), Closers (0v0 shields). Require the team to plausibly
fill all three roles; penalize teams that are three leads.

**e) Bulk / consistency.** PvPoke grades these separately; the Consistency category
captures bait-dependence, which matters because bait-dependent Pokémon underperform
for a human under time pressure.

Use a **geometric mean** (or similar) to aggregate team-level component scores:
it punishes being terrible at any one thing more than an arithmetic mean would,
and a team with no closer should score badly, not average out. Note this can no
longer be justified as "what PvPoke does" — its actual overall formula is weighted
12:6:4:2 toward each Pokémon's *best* categories to favour specialists (see
`reference/data-sources.md`). The property is desirable here on its own merits;
per-Pokémon specialist-friendliness and team-level role-completeness are different
goals.

Keep every weight in a single config object. You will tune these against your own
judgment, repeatedly.

As implemented (`src/score.ts`): five components — weighted coverage, threat,
shared-weakness penalty, role coverage (best lead/swap/closer assignment over
the six permutations), consistency — aggregated as a weighted geometric mean,
every tunable in `ScoreConfig`. Opponents are weighted by their PvPoke
overall score until real usage data arrives (Milestone 5). Known gaps queued
for tuning after the evaluation checkpoint: **no bulk/stat-product
component** (PvPoke's Team Builder graded one of our teams D on bulk; this
scorer cannot see that), and **coverage is linear in rating**, so three hard
losses and nine hard losses score too close together. C(n,3) enumeration
confirmed comfortable at n=41: 10,660 teams in milliseconds.

---

## [6] Report

The report is organised as **three resource tiers** — optimal (no
constraints), budget (small power-ups only, `--max-levelup`), and ready-now
(existing mons at current level, zero investment) — each with one fully
detailed team plus brief alternates (`src/report.ts`, `npm run optimize`).

For each recommended team:

- Score plus the component breakdown (so a bad recommendation is debuggable)
- Meta scorecard: which common opponents you beat / lose to
- Remaining threats, ranked
- Coverage gaps in plain language ("nothing on this team handles Steel")
- Suggested role assignment (who leads, who swaps, who closes)
- An **in-game search string** to locate the members
- A **PvPoke Team Builder share link** so the team can be sanity-checked against
  the site's own grading — this is the cheapest possible validation loop

Also surface roster-level advice: "unlocking a second charged move on X appears in
N of your top 20 teams" is high-value output for deciding where to spend dust.

**`npm run rate` (`src/cli/rate.ts`)** is the inverse tool: instead of
searching, it grades a hand-picked team (or profiles single mons) with the
same scoring function, looking species up in the **full** rankings so
off-meta picks outside the top-100 viability pool are still gradeable.
`--pool-top N` additionally ranks the team against every team the roster
could field. Scores are directly comparable to the optimize report.

One scoring subtlety lives in `src/score.ts`: the vendor's type-effectiveness
multipliers are float32, so a neutral dual-type matchup computes as
1.6 × 0.625 = 1.0000000149. The weakness component therefore counts a
weakness only above `WEAKNESS_THRESHOLD = 1.1` (a real weakness is ≥ 1.6);
comparing `> 1` counts phantom weaknesses and mis-ranks teams.

---

## Anti-goals

- No web UI until the CLI produces teams worth trusting
- No multi-league optimization until single-league works
- No 6-Pokémon tournament format until 3 works
- No attempt to model the opponent's play beyond PvPoke's simulation assumptions
