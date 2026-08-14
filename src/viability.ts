import type { RankingEntry } from "./data/pvpoke.js";
import type { Candidate } from "./resolve.js";
import type { PvpokeSim } from "./sim/harness.js";

// Stage 3: cut the expanded candidate list down to what is worth simulating.
// A candidate survives iff its target species is in the league's meta
// (top-N ranking entries) AND a legal build exists (optimal level under the
// cap is not below the mon's current level). The league comes in through the
// sim (its CP cap) and the rankings (the league's file). Where several owned
// mons build
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
  /** 1-based position in the league's overall rankings. */
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

/**
 * The "little power-ups" subset of an optimal viable list: builds whose
 * optimal level is within `maxLevelUp` of the mon's current level, and which
 * stay out of XL-candy territory (level ≤ 40 — XL is its own scarce resource,
 * not "little"). Same builds and matrix rows as the optimal tier; only the
 * team search pool shrinks.
 */
export function filterBudgetCandidates(
  viable: readonly ViableCandidate[],
  maxLevelUp: number,
): ViableCandidate[] {
  return viable.filter(
    (v) =>
      v.build.level - v.candidate.owned.level <= maxLevelUp &&
      v.build.level <= 40,
  );
}

/**
 * The "ready now" tier: each mon exactly as scanned — current form (no
 * evolution), current level (no power-ups). Eligible iff that form is in the
 * meta top-N and its current CP fits under the cap; `infeasible` collects
 * meta-relevant forms already sitting above the cap. The simulated build's CP
 * must reproduce the scanned CP exactly, which cross-checks species
 * resolution and the vendored base stats against the game's own numbers.
 */
export function selectReadyCandidates(
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
    if (candidate.evolutionSteps !== 0) {
      continue; // evolving costs candy — not "as it stands"
    }
    const ranked = rankById.get(candidate.targetSpeciesId);
    if (ranked === undefined) {
      continue;
    }
    if (candidate.owned.cp > sim.cap) {
      infeasible.push(candidate);
      continue;
    }
    const build = sim.buildPokemon({
      speciesId: candidate.targetSpeciesId,
      moveset: ranked.entry.moveset,
      ivs: candidate.owned.ivs,
      exactLevel: candidate.owned.level,
    });
    if (build.cp !== candidate.owned.cp) {
      throw new Error(
        `Rebuilding ${candidate.targetSpeciesId} at L${candidate.owned.level} ` +
          `with IVs ${candidate.owned.ivs.atk}/${candidate.owned.ivs.def}/` +
          `${candidate.owned.ivs.hp} gives CP ${build.cp}, but Poke Genie ` +
          `scanned CP ${candidate.owned.cp} (${candidate.owned.name}). Either ` +
          `species resolution picked the wrong form, the vendored base stats ` +
          `have drifted, or the mon is CP-boosted in-game (best buddy?). ` +
          `Refusing to continue on inconsistent data.`,
      );
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
