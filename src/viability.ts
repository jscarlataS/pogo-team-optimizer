import type { RankingEntry } from "./data/pvpoke.js";
import type { Candidate } from "./resolve.js";
import type { PvpokeSim } from "./sim/harness.js";

// Stage 3: cut the expanded candidate list down to what is worth simulating.
// A candidate survives iff its target species is in the Great League meta
// (top-N ranking entries) AND a legal build exists (optimal level under the
// cap is not below the mon's current level). Where several owned mons build
// the same target species, only the best stat-product specimen is kept —
// duplicate species on one team is not a line this tool pursues.

export interface ViabilityConfig {
  /** Ranking entries (not base species) that count as "the meta". */
  topN: number;
}

export const DEFAULT_VIABILITY: ViabilityConfig = { topN: 100 };

export interface ViableCandidate {
  candidate: Candidate;
  ranking: RankingEntry;
  /** 1-based position in the overall GL rankings. */
  rank: number;
  /** Battle-ready vendor Pokemon at optimal level with real IVs + ranked moves. */
  build: {
    level: number;
    cp: number;
    stats: { atk: number; def: number; hp: number };
    [key: string]: unknown;
  };
  statProduct: number;
}

export interface ViabilityResult {
  viable: ViableCandidate[];
  /** Meta-relevant targets with no legal build (already over the cap). */
  infeasible: Candidate[];
  /** Physical-mon/target pairs that lost the best-specimen dedupe. */
  outclassed: ViableCandidate[];
}

export function selectViableCandidates(
  candidates: readonly Candidate[],
  rankings: readonly RankingEntry[],
  sim: PvpokeSim,
  config: ViabilityConfig = DEFAULT_VIABILITY,
): ViabilityResult {
  const rankById = new Map<string, { entry: RankingEntry; rank: number }>();
  rankings.slice(0, config.topN).forEach((entry, i) => {
    rankById.set(entry.speciesId, { entry, rank: i + 1 });
  });

  const bestByTarget = new Map<string, ViableCandidate>();
  const infeasible: Candidate[] = [];
  const outclassed: ViableCandidate[] = [];
  for (const candidate of candidates) {
    const ranked = rankById.get(candidate.targetSpeciesId);
    if (ranked === undefined) {
      continue; // outside the meta — not an error, just not worth a team slot
    }
    const build = sim.buildPokemon({
      speciesId: candidate.targetSpeciesId,
      moveset: ranked.entry.moveset,
      ivs: candidate.owned.ivs,
      levelFloor: candidate.owned.level,
    });
    if (build === null) {
      infeasible.push(candidate);
      continue;
    }
    const viable: ViableCandidate = {
      candidate,
      ranking: ranked.entry,
      rank: ranked.rank,
      build,
      statProduct: build.stats.atk * build.stats.def * build.stats.hp,
    };
    const incumbent = bestByTarget.get(candidate.targetSpeciesId);
    if (incumbent === undefined) {
      bestByTarget.set(candidate.targetSpeciesId, viable);
    } else if (viable.statProduct > incumbent.statProduct) {
      outclassed.push(incumbent);
      bestByTarget.set(candidate.targetSpeciesId, viable);
    } else {
      outclassed.push(viable);
    }
  }

  const viable = [...bestByTarget.values()].sort((a, b) => a.rank - b.rank);
  return { viable, infeasible, outclassed };
}
