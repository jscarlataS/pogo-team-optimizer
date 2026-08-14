# Data sources

Everything here was gathered in August 2026. Pokémon GO and PvPoke both change on a
roughly two-week cycle, so treat paths and shapes as *verified-then*, not
verified-now. Re-check before relying on anything marked unverified.

---

## PvPoke

**Repo:** `github.com/pvpoke/pvpoke`
**License:** MIT — free to use with attribution retained. Keep the license file when
vendoring.
**Vendored:** `vendor/pvpoke/` — shallow sparse clone (`src/data` + `src/js` + root
files, ~everything reusable; PHP views excluded) at commit `e5ee9b7672`, dated
2026-08-13. All shapes below marked **verified** were read from this copy on
2026-08-14. To refresh: `git -C vendor/pvpoke pull` (sparse dirs can be added with
`git sparse-checkout add <dir>`, needs network).
**Composition:** JavaScript (~44%) + PHP (~33%). The PHP is views only; all the logic
worth reusing is JS.

The README explicitly invites reuse of the ranking code: it suggests copying
`Ranker.js` or `RankerOverall.js` and experimenting with your own algorithms, and
lists features built on existing data and interfaces as welcome contributions.

### Data files

| Path | Contents |
|---|---|
| `src/data/gamemaster.json` | All Pokémon, moves, base stats, typings |
| `src/data/gamemaster.min.json` | Minified variant |
| `src/data/rankings/{cup}/{category}/rankings-{cp}.json` | Precomputed rankings |
| `src/data/groups/` | Cup and custom group definitions |
| `src/data/overrides/` | Manual ranking overrides |
| `src/data/training/` | Train-mode data |

**Rankings path parameters:**
- `{cup}` — `all` for open leagues; cup slug otherwise
- `{cp}` — `500` (Little), `1500` (Great), `2500` (Ultra), `10000` (Master)
- `{category}` — `overall`, `leads`, `closers`, `switches`, `chargers`, `attackers`,
  `consistency`

Raw fetch form:
`https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json`

Prefer GitHub raw or a vendored copy over scraping the live site.

### Ranking methodology — verified against code, and previously wrong here

Each Pokémon scores 0–100 per league/category, derived by simulating every matchup
using its best moveset. The battle scenarios come from `rankingScenarios` in
`gamemaster.json` and are applied in `src/js/battle/rankers/Ranker.js` (~line 294):
`shields` is `[subject, opponent]`; `energy: [n, m]` gives each side `n`/`m` turns'
worth of *its own fast move* converted to starting energy.

| Category | shields | energy | Extra handling in Ranker.js |
|---|---|---|---|
| Leads | 1 v 1 | 0, 0 | — |
| Closers | 0 v 0 | 0, 0 | — |
| Switches | 1 v 1 | **subject +4 turns** | losses < 500 get extra weight ("identify safe switches") |
| Chargers | 1 v 1 | subject +6 turns | score multiplied by fast-move pressure + carryover-energy factor |
| Attackers | 0 v 1 | 0, 0 | — |
| Consistency | — | — | not a battle scenario; computed by `Pokemon.calculateConsistency()` (bait-dependence) |

**Three rows of the previous table here were wrong** (it claimed Leads 2v2,
Attackers 0v2, and Switches at a 6-turn energy *deficit*). Per the current data the
switches subject has a 4-turn energy **advantage** — wrong number and wrong
direction. The "favour safe matchups" part was right, but it is implemented as a
weighting on hard losses, not as an energy handicap. (Whether `+4 turns` models
"receiving an opponent's switch" is interpretation; the numbers above are
observation.)

**The "overall = geometric mean of category scores" claim was also wrong in an
important way.** The real formula (`RankerOverall.js` ~line 180):

1. Take `[leads, closers, max(switches, chargers), attackers]`, sort descending
   into `s1..s4`.
2. `overall = (s1^12 · s2^6 · s3^4 · s4^2 · consistency^2)^(1/26)`
3. If `attackers ≤ 75` **and** `consistency ≤ 75`, blend a penalty:
   `overall = (overall^14 · attackers · consistency)^(1/16)`.

It is a geometric *form*, but weighted 12:6:4:2 toward the Pokémon's **best**
categories — the code comments say the intent is to "better represent specialized
Pokemon". That is close to the opposite of "punishes being useless in any one
scenario". A specialist terrible in one category can still rank highly. The
architecture's own team-scoring choice (geometric mean to punish missing roles)
must stand on its own merits; it is **not** PvPoke precedent.

**Editorial blending:** when an override provides `editorScore`, the published
overall score is `0.25 · simulated + 0.75 · editorScore` (`RankerOverall.js` ~line
205). Top-ranked Mimikyu's 95.9 is mostly editorial. Threshold filters on `score`
inherit human judgment, not pure simulation.

### Rankings JSON — verified shape

`rankings/all/overall/rankings-1500.json` at the vendored commit: a JSON **array of
1,143 entries**, sorted by `score` descending. Two key sets exist: all entries have
the 10 keys below; some additionally have `editorScore` + `editorNotes`.

```jsonc
{
  "speciesId": "altaria_shadow",        // PvPoke id, lowercase snake
  "speciesName": "Altaria (Shadow)",    // display name, forms in parens
  "rating": 778,                        // mean *adjusted* battle rating vs whole meta, 0–1000
  "score": 91.9,                        // overall 0–100 (formula above)
  "scores": [100, 100, 100, 97.7, 92.5, 94.2],
       // order: [leads, closers, switches, chargers, attackers, consistency]
       // (RankerOverall.js loads categories in that order, appends consistency)
  "moveset": ["SHADOW_CLAW", "SHADOW_SNEAK", "PLAY_ROUGH"],  // fast + 1–2 charged, UPPER_SNAKE ids
  "moves": { "fastMoves":    [ { "moveId": "SHADOW_CLAW", "uses": 84992 } ],
             "chargedMoves": [ { "moveId": "THUNDER",     "uses": 43567 } ] },
       // simulated usage counts; may list more moves than `moveset`
  "matchups": [ { "opponent": "altaria", "rating": 859 } ],   // see semantics below
  "counters": [ { "opponent": "lickilicky", "rating": 309 } ],
  "stats": { "product": 1842, "atk": 121.5, "def": 141.6, "hp": 107 }
       // effective stats at the league cap; product = atk·def·hp / 1000
}
```

**Matchup array semantics — confirmed truncated** (`Ranker.js` ~lines 541–604).
The full round-robin `matches` array is deleted before publishing. What survives:

- `matchups`: at most 5 (observed min 1) matchups with raw battle rating **> 500**
  (wins only), chosen by highest opponent-rank-weighted significance, then sorted
  by rating descending.
- `counters`: 5 matchups with rating **< 500** (losses only), the most significant,
  sorted ascending (worst first).
- The `rating` in these entries is the *raw* battle rating
  (`floor((healthRemaining% + damageDealt%) × 500)`), not the adjusted one.

**Consequence: the rankings JSON cannot substitute for the simulator**, even as a
cheap first pass — it names only ≤5 wins and 5 losses per Pokémon. The full owned ×
meta matrix (architecture stage 4) genuinely requires driving `Battle.js`.

Other confirmations: the GL file contains **none** of `greatLeagueIneligible`
(checked by join), so top-N slices are already legal GBL picks; all 1,143
`speciesId` values resolve against `gamemaster.json`; the top 100 collapse to **78
distinct base species** once `_shadow` is stripped.

### gamemaster.json — verified shape

Top-level keys: `id`, `title`, `timestamp`, `settings`, `cups`, `formats`, `moves`,
`pokemon`, `pokemonTags`, `pokemonRegions`, `pokemonTraits`, `rankingScenarios`,
`shadowPokemon`, `greatLeagueIneligible`, `chargedMoveArchetypes`,
`fastMoveArchetypes`. It is compiled by `src/data/compile.php` from the fragments in
`src/data/gamemaster/` (`base.json`, `pokemon.json`, `moves.json`, `formats.json`,
`cups/*.json`) — edit nothing in the compiled file.

**Pokémon entries** (1,740). Keys on every entry: `dex`, `speciesName`, `speciesId`,
`baseStats {atk, def, hp}`, `types` (2-element lowercase array, `"none"` filler for
monotypes), `fastMoves[]` / `chargedMoves[]` (UPPER_SNAKE move ids), `defaultIVs`,
`buddyDistance`, `thirdMoveCost`, `released` (bool). Frequent: `family {id,
parent?, evolutions?}` (1,366), `tags` (1,209), `level25CP` (516). Occasional:
`eliteMoves` (428), `searchPriority` (332), `nicknames` (103), `levelFloor` (39),
`legacyMoves` (21), `originalFormId` (6), `formChange` (5), `aliasId` (2),
`nativeStatBuffs` (2).

- `defaultIVs`: `{ "cp500": [...], "cp1500": [...], "cp2500": [...] }`, each value
  `[level, atkIV, defIV, hpIV]` (order confirmed in `Pokemon.js` ~line 305; a
  `cp{n}l40` variant may exist for level-40 caps). No `cp10000` key — Master League
  is hardcoded 15/15/15 at level cap.

**Shadow / form / variant representation** — everything is a *separate entry in
`pokemon[]`*; forms share the base `dex` number:

| Variant | speciesId pattern | speciesName pattern | tags |
|---|---|---|---|
| Shadow | `sandslash_shadow` | `Sandslash (Shadow)` | `shadow` |
| Regional | `sandslash_alolan` | `Sandslash (Alolan)` | `alolan` (also `galarian`, `hisuian`, `paldean`) |
| Both stacked | `sandslash_alolan_shadow` | `Sandslash (Alolan) (Shadow)` | `alolan`, `shadow` |
| Mega | `venusaur_mega`, `charizard_mega_x` | `Venusaur (Mega)`, `Charizard (Mega X)` | `mega` |
| Multi-form | `castform_rainy`, `giratina_origin` | `Castform (Rainy)`, `Giratina (Origin)` | — |

474 `_shadow` entries exist; shadow-eligible base forms carry tag `shadoweligible`,
and the top-level `shadowPokemon` array (509 ids) lists shadow-capable species.

Traps for species resolution, all observed:

- **Some species have no base entry** — there is no `giratina`, only
  `giratina_altered` / `giratina_origin`. Do not assume `speciesId == base name`.
- **Gendered forms are inconsistent**: `nidoran_female` / `nidoran_male` (own dex
  numbers, names "Nidoran Female/Male" — no parens); `meowstic` is the *male*
  ("Meowstic (Male)") with `meowstic_female` separate; `indeedee_male` /
  `indeedee_female` both suffixed; `oinkologne` base + `oinkologne_female`.
  Frillish and Pyroar have a single entry each (gender not modelled).
- **Cosmetic-ish forms are ranked entries**: "Mimikyu (Busted)", Gourgeist/Pumpkaboo
  sizes "(Small/Average/Large/Super)", "Morpeko (Hangry)", "Aegislash (Blade)",
  Castform weather forms — all appear in the GL top 100.
- `aliasId` (`lanturnw → lanturn`, `cradily_b → cradily`) marks duplicate entries
  used for special cups (tag `duplicate`); resolve aliases before matching.

**Move entries** (347). Always: `moveId`, `name`, `type` (lowercase), `power`,
`energy` (cost; 0 for fast moves), `energyGain` (0 for charged moves), `cooldown`
(ms; charged = 500), `turns`; `archetype` on 346. Optional: `abbreviation` (166),
`buffs` `[atkStages, defStages]` + `buffTarget` (`"opponent"`/`"self"`) +
`buffApplyChance` (97 — **a string**, e.g. `"1"`, not a number), `unlisted` (20),
`isMegaMove` (13), `buffsOpponent`/`buffsSelf` (1 each).

`settings` is only `{ partySize: 3, maxBuffStages: 4, buffDivisor: 4 }`.
`greatLeagueIneligible` lists species banned from open GL (Mewtwo, Giratina
(Altered), Dialga, …) — the published GL rankings already respect it.

### Battle simulator — headless findings (static inspection)

`src/js/battle/Battle.js` and dependencies. Browser-oriented; not an npm package.
Rankings are normally regenerated by opening `ranker.php` / `rankersandbox.php` in a
browser and reading console output. A Docker setup exists at `docker/docker-compose.yml`
for running the site locally.

Battle Rating scale: **0–1000, above 500 is a win** — confirmed:
`Pokemon.getBattleRating()` is `floor(500·(damage dealt %) + 500·(own HP remaining
%))`. Ranker.js additionally computes an *adjusted* rating (± up to 100 per shield
burned/remaining) used for scores; the published matchup arrays carry the raw one.

What headless operation needs (verified by grep over the vendored copy — the
runtime cost question stays open until Milestone 2 actually runs it):

- **No module system anywhere.** Files declare browser globals and expect each
  other in shared scope (site loads them via script tags). Under Node: evaluate in
  one `vm` context or concatenate; there is nothing to `require`.
- **Clean core.** `Pokemon.js`, `Player.js`, `DamageCalculator.js`,
  `ActionLogic.js`, `TimelineAction.js`, `TimelineEvent.js` contain zero
  DOM/jQuery/localStorage references.
- **Battle.js** touches the browser only via `InterfaceMaster` inside
  `this.init()` — the ranker never calls `init()`, and `dispatchUpdate()` no-ops
  without a callback. Globals it needs: `GameMaster`, `TimelineEvent`,
  `TimelineAction`, `ActionLogic`, `DamageCalculator`, `DecisionOption` — the last
  is a `class` in `src/js/training/DecisionOption.js`, *outside* the battle dir.
- **GameMaster.js is the dirty one**: `$.ajax`/`$.getJSON` (data loading),
  `$.each` (iteration), `window.localStorage`, and some DOM insertion. Options:
  shim a minimal `$` + `localStorage` and feed it `gamemaster.json` from disk, or
  bypass its loader and populate its data property directly.
- **Driving pattern** (from `Ranker.js`): `new Battle()` → `setCP` / `setCup` →
  `setNewPokemon(p, 0, false)` / `setNewPokemon(opp, 1, false)` → `reset()`,
  `setShields()`, `startEnergy` per scenario → `battle.simulate()` → read
  `getBattleRating()` / `getTurnsToWin()`.

### API

There is none. No public REST endpoint. Consume the static JSON.

---

## Poke Genie

**What it is:** a screen-reading companion app. It performs OCR on pixels — it does
**not** read game files, and there are no game files to read. The collection lives on
Niantic's servers and the local cache is sandboxed. This is precisely why the app is
ToS-safe: it relies only on screenshot/screen recording and requires no login.

### Scanning modes

- **Overlay (Android)** — floating button; open a Pokémon's detail page, tap, it reads
  that screen. One Pokémon per tap.
- **IVision (iOS)** — introduced in iOS v6.0, "scan without screenshots," using iOS's
  Screen Recording to read Pokémon info live. It is the iOS counterpart to the Android
  overlay: it removes the screenshot round-trip but is still one Pokémon per screen.
  It is **not** a bulk mode.
- **Screenshot import** — capture screenshots, process them in bulk later. Decouples
  capture from processing.

A "Batch Scan" mode that auto-captures while scrolling the storage grid is described
on some third-party sites but **could not be substantiated from Poke Genie's own
materials** — treat as unconfirmed.

### What a scan can and cannot yield

The storage grid view shows sprite, name, CP and badges only. That is insufficient for
anything: no HP (so IVs cannot be constrained at all), no dust cost (so level cannot be
inferred), and critically **no moves**. Moveset is arguably more decisive than IVs for
PvP viability, and the matchup matrix is keyed on it.

- **Detail page scan** → CP, HP, level, moves, and a *range* of candidate IV combinations
- **Appraisal screen scan** → exact IVs. Poke Genie auto-detects and fills in the team
  leaders' appraisal text, so no manual entry, but navigating into appraisal costs
  several extra taps per Pokémon.

### CSV export

Behind the paid tier — **"Scan Pro + Remove Ads", $9.99 one-time IAP** (also unlocks
IVision on iOS). Exports scan data with a broad set of attributes for the entire scan
history. It cannot carry images, so exported entries are incomplete relative to the
in-app records — irrelevant here, since only stats and moves are needed.

**Semantics warning:** the export is *scan history*, not a collection snapshot. See
`architecture.md` §1.

Expected fields (species, CP, HP, IVs, IV average, level, fast move, charged moves,
shadow/purified, lucky, per-league PvP ranks) — **exact column headers unverified**,
confirm against a real export.

---

## Prior art — read these before writing much code

Several projects already attack this problem. Reading them is cheaper than
rediscovering their design decisions.

| Project | Notes |
|---|---|
| `crsiebler/pogo-team-optimizer` | Python. Closest match to this project's goal. Analyses local PvP simulation matrices and PvPoke ranking exports to recommend six-member teams, evaluating matchup coverage across shield scenarios and identifying fragile matchups. Vendors PvPoke as a submodule. Scores bring-6 rosters with 60 ordered pick-3 lineups per 6. Weighted components: synergy, threat coverage, safety, consistency, bulk, defensive-type ratio, offensive-move ratio, role fit. Shield weighting 0.30/0.50/0.20 for 0/1/2. |
| `crsiebler/pogo-team-generator` | Next.js — closer to this stack. Format-aware genetic algorithm over PvPoke rankings and matchup data, generating 6-Pokémon and 3-Pokémon teams with simulation-backed fitness. Explicitly does *not* model personal inventory constraints, which is the gap this project fills. |
| `xjdeng/pvpoke_team_optimizer` | Scrapes PvPoke to find the best team buildable from existing Pokémon. Directly the roster-constrained goal; scraping-based. |
| `veeenu/pvptimize` | Independent PvP simulation and team analysis engine. Its wishlist includes constrained team optimization. |
| `PogoTeams/pogo_teams` | Flutter GBL team builder with battle-log analysis, using PvPoke data. |

Commercial equivalents worth trying before building (per the earlier research): a
scan-your-box-and-generate-teams app exists and does roughly this. If it turns out to
be sufficient, that is a legitimate outcome — but building it is also the point.

---

## Meta usage data

- **gobattlelog.com** — crowdsourced battle logs; shares data back to PvPoke each
  season. Best source for what is actually being played.
- **PvPoke Top Performers / Training Analysis** — usage and ratings from Train-mode
  battles. PvPoke itself cautions that this data is sampled from both players and bots
  in the higher difficulties and is not empirical; performance and usage figures are
  subject to whoever uses the Train feature. Directional only.

---

## Legal boundary

Niantic's ToS prohibits accessing or scraping the game's services and backends, and
using modified or unauthorized third-party software that accesses Pokémon GO. Niantic
has issued cease-and-desists and ban warnings over tools that hook the client or API.

Screenshot-based scanners that only read the screen with no login are the accepted,
low-risk approach — which is exactly what this project's ingestion path relies on.

**This tool must never authenticate to, call, or scrape Niantic services.** It ingests
a CSV the user exported themselves and static MIT-licensed PvPoke data. Nothing else.
