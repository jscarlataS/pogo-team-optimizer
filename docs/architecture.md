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

Source: Poke Genie "Scan Pro" CSV export.

Critical semantics: **the export is scan *history*, not a collection snapshot.**
Consequences:

- The same Pokémon scanned twice appears twice → dedupe
- A Pokémon transferred after scanning is still in the file → needs an "owned" flag
  or a recency heuristic
- There is no stable per-Pokémon ID from the game, so dedupe must be heuristic
  (species + CP + HP + IVs + moves is usually unique enough)

Design for this from the start rather than discovering it when the optimizer
recommends a team containing a Pokémon that was traded away.

Target internal shape:

```ts
type OwnedPokemon = {
  id: string;              // synthetic, stable across runs
  speciesId: string;       // PvPoke id, e.g. "azumarill"
  displayName: string;
  cp: number;
  hp: number;
  level: number;           // may be fractional (half levels)
  ivs: { atk: number; def: number; sta: number } | IvRange;
  fastMove: string;        // PvPoke move id
  chargedMoves: string[];  // 1-2 entries
  shadow: boolean;
  purified: boolean;
  lucky: boolean;
  scannedAt: Date;
};
```

`IvRange` matters: a detail-page-only scan yields a *set* of candidate IV
combinations, not exact values. Support both from day one — see roadmap Milestone 3.
When only a range is available, resolve to the median stat product candidate and
mark the entry `ivPrecision: "range"` so the report can flag it.

---

## [2] Species resolution

CSV species names will not match PvPoke `speciesId` values directly. Expect friction on:

- Regional forms (Alolan / Galarian / Hisuian / Paldean)
- Shadow variants — PvPoke typically models these as separate ranking entries
- Mega evolutions
- Multi-form species (Castform, Deoxys, Giratina, Therian formes, etc.)
- Gendered forms and cosmetic variants that are *not* separate PvPoke entries

Build the lookup from `gamemaster.json` itself rather than hardcoding a map.
Keep an explicit `overrides.json` for the handful that won't resolve automatically,
and **fail loudly on unresolved names** — silently dropping a Pokémon means silently
dropping a possibly-optimal team member.

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

---

## [4] Matchup matrix

The expensive step. For each (owned Pokémon, meta opponent, shield scenario) triple,
run a PvPoke simulation and store the **Battle Rating** (0–1000; >500 is a win).

Approach: vendor PvPoke's `src/js/battle/Battle.js` plus its dependencies
(`GameMaster.js`, `Pokemon.js`, move logic) and drive them from Node. The code was
written for the browser, so expect to stub or shim DOM/globals it touches. It is not
published as an npm package.

Shield scenarios: 0v0, 1v1, 2v2. Prior art (crsiebler/pogo-team-optimizer) weights
these **0.30 / 0.50 / 0.20** respectively — 1-shield weighted highest because it is
the most common real scenario. Adopt as a starting point, expose as config.

Sizing: 60 owned × 100 meta × 3 scenarios = 18,000 sims. At a few ms each that is
seconds to low minutes. Once. Then cache.

Cache key: hash of (sorted roster ids + meta list + gamemaster version + sim config).
Invalidate on any change. Store as JSON or a typed array on disk.

**Movesets:** each Pokémon has one fast + up to two charged moves. Simulate with the
moveset the user *actually has*, not PvPoke's recommended one — the whole point is
modelling the real collection. Where a Pokémon has an unlocked second charged move,
that materially changes its matchups; where it doesn't, the tool should flag
"unlocking X would improve this" as a report output.

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

---

## [6] Report

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

---

## Anti-goals

- No web UI until the CLI produces teams worth trusting
- No multi-league optimization until single-league works
- No 6-Pokémon tournament format until 3 works
- No attempt to model the opponent's play beyond PvPoke's simulation assumptions
