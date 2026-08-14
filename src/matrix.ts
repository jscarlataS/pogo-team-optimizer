import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RankingEntry } from "./data/pvpoke.js";
import type { PvpokeSim } from "./sim/harness.js";
import type { ViableCandidate } from "./viability.js";

// Stage 4: the expensive step — every (viable candidate × meta opponent ×
// shield scenario) battle, simulated once and cached on disk. Our side uses
// real IVs at the optimal legal level; opponents use PvPoke's league default
// IVs and ranked movesets, i.e. exactly the assumption behind the published
// rankings. Measured cost is ~0.45 ms/sim, so a full matrix is seconds — the
// cache exists so iterating on *scoring* is instant.

export const SHIELD_SCENARIOS = [
  { key: "0v0", shields: [0, 0] as const },
  { key: "1v1", shields: [1, 1] as const },
  { key: "2v2", shields: [2, 2] as const },
] as const;

export interface MatrixConfig {
  /** Ranking entries that form the opponent pool. */
  metaN: number;
}

export const DEFAULT_MATRIX: MatrixConfig = { metaN: 100 };

export interface MatchupMatrix {
  gamemasterTimestamp: string;
  /** Row keys: candidate target speciesIds, in the viable list's order. */
  candidates: string[];
  /** Column keys: meta opponent speciesIds, rankings order. */
  meta: string[];
  scenarios: string[];
  /** ratings[candidate][opponent][scenario] — our raw battle rating, 0–1000. */
  ratings: number[][][];
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(REPO_ROOT, "out", "cache");

/**
 * Cache identity: everything the ratings are a pure function of — vendored
 * gamemaster version, league CP cap (opponent default builds derive from it
 * via battle.getCP()), opponent pool with movesets, scenario set, and each
 * candidate's exact build (species, IVs, level, moveset).
 */
function cacheKey(
  timestamp: string,
  cap: number,
  viable: readonly ViableCandidate[],
  metaEntries: readonly RankingEntry[],
): string {
  const material = JSON.stringify({
    timestamp,
    cap,
    scenarios: SHIELD_SCENARIOS.map((s) => s.key),
    meta: metaEntries.map((e) => [e.speciesId, e.moveset]),
    candidates: viable.map((v) => [
      v.candidate.targetSpeciesId,
      v.candidate.owned.ivs,
      v.build.level,
      v.ranking.moveset,
    ]),
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function computeMatrix(
  viable: readonly ViableCandidate[],
  rankings: readonly RankingEntry[],
  sim: PvpokeSim,
  gamemasterTimestamp: string,
  config: MatrixConfig = DEFAULT_MATRIX,
  log: (line: string) => void = () => {},
): MatchupMatrix {
  const metaEntries = rankings.slice(0, config.metaN);
  const key = cacheKey(gamemasterTimestamp, sim.cap, viable, metaEntries);
  const cachePath = join(CACHE_DIR, `matrix-${key}.json`);

  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as MatchupMatrix;
    if (
      cached.candidates.length === viable.length &&
      cached.meta.length === metaEntries.length
    ) {
      log(`matchup matrix: cache hit (${cachePath})`);
      return cached;
    }
    // Hash collision or hand-edited file — fall through and overwrite.
  }

  const opponents = metaEntries.map((e) =>
    sim.buildPokemon({ speciesId: e.speciesId, moveset: e.moveset }),
  );
  const before = sim.simCount;
  const t0 = performance.now();
  const ratings = viable.map((v, i) => {
    if (i % 10 === 0) {
      log(`matchup matrix: candidate ${i + 1}/${viable.length}…`);
    }
    return opponents.map((opp) =>
      SHIELD_SCENARIOS.map(
        (s) => sim.duel(v.build, opp, { shields: s.shields }).rating,
      ),
    );
  });
  const elapsed = performance.now() - t0;
  log(
    `matchup matrix: ${sim.simCount - before} sims in ${(elapsed / 1000).toFixed(1)}s ` +
      `(${(elapsed / (sim.simCount - before)).toFixed(2)} ms/sim)`,
  );

  const matrix: MatchupMatrix = {
    gamemasterTimestamp,
    candidates: viable.map((v) => v.candidate.targetSpeciesId),
    meta: metaEntries.map((e) => e.speciesId),
    scenarios: SHIELD_SCENARIOS.map((s) => s.key),
    ratings,
  };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(matrix));
  log(`matchup matrix: cached at ${cachePath}`);
  return matrix;
}
