# pogo-team-optimizer

Given the Pokémon I actually own, what are the strongest 3-Pokémon teams I can
bring to GO Battle League? PvPoke ranks Pokémon and grades a team you hand it;
it does not search over a constrained roster. That gap is this project.

Orientation for contributors (human or agent) is in `CLAUDE.md`; project state
lives in `docs/status.md`.

## Setting up on a new machine

```bash
git clone git@github.com:jscarlataS/pogo-team-optimizer.git
cd pogo-team-optimizer
./scripts/setup.sh
```

`setup.sh` is idempotent — re-run it any time. It installs dependencies from
the lockfile and vendors PvPoke at the pinned commit, then verifies the tree.
Takes well under a minute on a warm connection.

Confirm the checkout is good:

```bash
npm test          # expect the suite green
npm run optimize -- --roster data/poke_genie_export_updated.csv
```

Requires **Node ≥ 20** (developed on 26.x) and `git`. Nothing else — the
project has no runtime dependencies and no global tooling.

## Working across two machines

Everything needed to reproduce a run is either in git or rebuilt by
`setup.sh`, so switching devices is `git pull` and go. The only discipline is
committing your roster CSV when it changes.

| What | Size | Travels how |
| --- | --- | --- |
| `src/`, `test/`, `docs/`, `fixtures/` | ~250K | git |
| `.claude/skills/`, `CLAUDE.md` | ~50K | git |
| `data/*.csv` — roster | 68K | **git** (see below) |
| `out/teams.md`, `out/gl-search-strings.md` | ~10K | git (tracked for phone access) |
| `node_modules/` | 78M | `npm ci`, from the committed lockfile |
| `vendor/pvpoke/` | 148M | pinned sparse clone, ~10s |
| `out/cache/` | 372K | rebuilt in ~2.2s on first run |

Leaving a machine mid-task: commit and push, and make sure `docs/status.md`
reflects where you actually are. It is the handoff document — the next
session on the other machine reads it first.

### Roster data

The Poke Genie exports in `data/` are the one input no script can regenerate,
so they are committed. This repo is **private**, and the export contains only
game data — species, IVs, CP, dust costs — no trainer name, account, or
location. Two consequences worth knowing:

- Roster history is versioned, so an old report stays reproducible against the
  roster it was generated from.
- If this repo is ever made public, strip `data/` from the history first.

New scans are additive: export from Poke Genie, drop the CSV in `data/`,
commit. Never wipe the Poke Genie box — add, and delete only individually on
in-game transfer.

Note that the CLIs still default to `data/poke_genie_export.csv` while the
current export is `data/poke_genie_export_updated.csv`; pass `--roster`
explicitly until that default is resolved (`docs/status.md`, open threads).

## Commands

| Command | What it does |
| --- | --- |
| `npm run optimize` | Full run → ranked teams in `out/teams.md` |
| `npm run rate` | Score a hand-picked team, or profile individual Pokémon |
| `npm run candidates` | Stage-3 eyeball checkpoint on the viable pool |
| `npm run species-list` | In-game search strings for the meta |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |

## Vendored PvPoke

`vendor/pvpoke/` is a sparse, shallow, blob-filtered checkout of
[pvpoke/pvpoke](https://github.com/pvpoke/pvpoke) (MIT) pinned to commit
`e5ee9b7672` — only `src/data` and `src/js`, which is the game data and the
battle simulator. Attribution and license are retained in the checkout.

The pin is deliberate: PvPoke's data shapes shift as the game meta changes,
and our parsers were verified against this exact commit. To move the pin,
update `PVPOKE_COMMIT` in `scripts/setup.sh` **and** the pin recorded in
`docs/reference/data-sources.md`, then re-run the suite — the loaders fail
loudly on shape drift by design.

## Constraints

This project never touches Niantic's servers or the game client. The only
ingestion path is a CSV you exported from Poke Genie yourself. See `CLAUDE.md`
for the full list.
