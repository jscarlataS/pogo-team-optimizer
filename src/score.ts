import type { RankingEntry } from "./data/pvpoke.js";
import type { MatchupMatrix } from "./matrix.js";
import type { ViableCandidate } from "./viability.js";

// Stage 5: the scoring function — per CLAUDE.md, the part that IS the project.
// Every tunable lives in ScoreConfig; the components are multiplied as a
// weighted geometric mean so a team that is terrible at any one thing scores
// badly instead of averaging out. (Deliberate choice, not PvPoke precedent —
// see data-sources.md on what PvPoke's overall formula actually does.)

export interface ScoreConfig {
  /** Battle-relevance of each shield scenario (crsiebler prior art). */
  shieldWeights: { "0v0": number; "1v1": number; "2v2": number };
  /** Exponents of the geometric aggregation; higher = matters more. */
  componentWeights: {
    coverage: number;
    threat: number;
    weakness: number;
    roles: number;
    consistency: number;
  };
  /**
   * "score": weight opponents by their PvPoke overall score (a proxy for how
   * often good players bring them, until real usage data lands in M5).
   * "uniform": every meta opponent counts equally.
   */
  opponentWeighting: "score" | "uniform";
  /** Penalties for members sharing a defensive weakness to one type. */
  weaknessPenalties: { triple: number; double: number; cap: number };
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  shieldWeights: { "0v0": 0.3, "1v1": 0.5, "2v2": 0.2 },
  componentWeights: {
    coverage: 0.35,
    threat: 0.2,
    weakness: 0.15,
    roles: 0.2,
    consistency: 0.1,
  },
  opponentWeighting: "score",
  weaknessPenalties: { triple: 0.4, double: 0.1, cap: 0.9 },
};

/** Everything scoring needs about one candidate — no simulator required. */
export interface MemberProfile {
  speciesId: string;
  /** Index into the viable list / matrix rows. */
  index: number;
  /** [leads, closers, switches, chargers, attackers, consistency], 0–100. */
  categoryScores: readonly number[];
  /** Defensive multiplier per attacking type (from the vendor type chart). */
  defensiveMultipliers: Readonly<Record<string, number>>;
  /** Shield-weighted battle rating vs each meta opponent, 0–1000. */
  weightedRating: readonly number[];
}

export interface MetaProfile {
  ids: readonly string[];
  /** Normalized to sum 1. */
  weights: readonly number[];
}

export function buildProfiles(
  viable: readonly ViableCandidate[],
  matrix: MatchupMatrix,
  rankings: readonly RankingEntry[],
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): { members: MemberProfile[]; meta: MetaProfile } {
  viable.forEach((v, i) => {
    if (matrix.candidates[i] !== v.candidate.targetSpeciesId) {
      throw new Error(
        `Matrix/viable mismatch at row ${i}: ${matrix.candidates[i]} vs ` +
          `${v.candidate.targetSpeciesId} — recompute the matrix.`,
      );
    }
  });
  const scenarioWeight = matrix.scenarios.map((key) => {
    const w = config.shieldWeights[key as keyof ScoreConfig["shieldWeights"]];
    if (w === undefined) {
      throw new Error(`No shield weight configured for scenario "${key}".`);
    }
    return w;
  });

  const members = viable.map((v, i): MemberProfile => {
    const rows = matrix.ratings[i]!;
    return {
      speciesId: v.candidate.targetSpeciesId,
      index: i,
      categoryScores: v.ranking.scores,
      // Vendor stores this as a string-keyed array; copy to a plain object.
      defensiveMultipliers: { ...(v.build as { typeEffectiveness?: Record<string, number> }).typeEffectiveness },
      weightedRating: rows.map((byScenario) =>
        byScenario.reduce((acc, r, s) => acc + r * scenarioWeight[s]!, 0),
      ),
    };
  });

  const scoreById = new Map(rankings.map((e) => [e.speciesId, e.score]));
  const raw = matrix.meta.map((id) => {
    if (config.opponentWeighting === "uniform") {
      return 1;
    }
    const s = scoreById.get(id);
    if (s === undefined) {
      throw new Error(`Meta opponent "${id}" missing from rankings — recompute the matrix.`);
    }
    return s;
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return {
    members,
    meta: { ids: matrix.meta, weights: raw.map((w) => w / sum) },
  };
}

export interface TeamScore {
  indices: [number, number, number];
  speciesIds: [string, string, string];
  /** 0–100. */
  total: number;
  /** Each 0–1. */
  components: {
    coverage: number;
    threat: number;
    weakness: number;
    roles: number;
    consistency: number;
  };
  roleAssignment: { lead: string; swap: string; closer: string };
  /** Meta opponents the team's best answer still loses to, worst first. */
  losses: string[];
  /** Types every member is weak to. */
  sharedWeaknesses: string[];
}

// categoryScores order (verified): [leads, closers, switches, chargers,
// attackers, consistency] → role indices:
const LEAD = 0;
const CLOSER = 1;
const SWITCH = 2;
const CONSISTENCY = 5;

const ROLE_PERMUTATIONS: ReadonlyArray<readonly [number, number, number]> = [
  // [leadMember, swapMember, closerMember]
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

const EPSILON = 1e-6;

// The vendor computes neutral dual-type matchups as products like 1.6 × 0.625,
// which lands at 1.0000000149 — strictly greater than 1. A real weakness is
// ≥1.6, so anything below this threshold is neutrality plus float noise.
const WEAKNESS_THRESHOLD = 1.1;

export function scoreTeam(
  team: readonly [MemberProfile, MemberProfile, MemberProfile],
  meta: MetaProfile,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): TeamScore {
  let coverage = 0;
  let threat = 0;
  const losses: Array<{ id: string; best: number }> = [];
  for (let m = 0; m < meta.ids.length; m++) {
    const w = meta.weights[m]!;
    const ratings = [
      team[0].weightedRating[m]!,
      team[1].weightedRating[m]!,
      team[2].weightedRating[m]!,
    ];
    const best = Math.max(...ratings);
    coverage += (w * best) / 1000;
    const severity =
      ratings.reduce((acc, r) => acc + Math.max(0, 500 - r) / 500, 0) / 3;
    threat += w * severity;
    if (best < 500) {
      losses.push({ id: meta.ids[m]!, best });
    }
  }
  const threatComponent = 1 - threat;

  const sharedWeaknesses: string[] = [];
  let weaknessPenalty = 0;
  for (const type of Object.keys(team[0].defensiveMultipliers)) {
    const weakCount = team.filter(
      (p) => (p.defensiveMultipliers[type] ?? 1) > WEAKNESS_THRESHOLD,
    ).length;
    if (weakCount === 3) {
      sharedWeaknesses.push(type);
      weaknessPenalty += config.weaknessPenalties.triple;
    } else if (weakCount === 2) {
      weaknessPenalty += config.weaknessPenalties.double;
    }
  }
  const weakness = 1 - Math.min(config.weaknessPenalties.cap, weaknessPenalty);

  let bestRoleProduct = 0;
  let bestPerm = ROLE_PERMUTATIONS[0]!;
  for (const perm of ROLE_PERMUTATIONS) {
    const product =
      (team[perm[0]]!.categoryScores[LEAD]! / 100) *
      (team[perm[1]]!.categoryScores[SWITCH]! / 100) *
      (team[perm[2]]!.categoryScores[CLOSER]! / 100);
    if (product > bestRoleProduct) {
      bestRoleProduct = product;
      bestPerm = perm;
    }
  }
  const roles = Math.cbrt(bestRoleProduct);

  const consistency = Math.cbrt(
    team.reduce((acc, p) => acc * p.categoryScores[CONSISTENCY]! / 100, 1),
  );

  const c = config.componentWeights;
  const components = { coverage, threat: threatComponent, weakness, roles, consistency };
  const total =
    100 *
    Math.pow(Math.max(components.coverage, EPSILON), c.coverage) *
    Math.pow(Math.max(components.threat, EPSILON), c.threat) *
    Math.pow(Math.max(components.weakness, EPSILON), c.weakness) *
    Math.pow(Math.max(components.roles, EPSILON), c.roles) *
    Math.pow(Math.max(components.consistency, EPSILON), c.consistency);

  losses.sort((a, b) => a.best - b.best);
  return {
    indices: [team[0].index, team[1].index, team[2].index],
    speciesIds: [team[0].speciesId, team[1].speciesId, team[2].speciesId],
    total,
    components,
    roleAssignment: {
      lead: team[bestPerm[0]]!.speciesId,
      swap: team[bestPerm[1]]!.speciesId,
      closer: team[bestPerm[2]]!.speciesId,
    },
    losses: losses.map((l) => l.id),
    sharedWeaknesses,
  };
}

export function searchTeams(
  members: readonly MemberProfile[],
  meta: MetaProfile,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
  topK = 10,
): { top: TeamScore[]; teamsScored: number } {
  const all: TeamScore[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      for (let k = j + 1; k < members.length; k++) {
        all.push(scoreTeam([members[i]!, members[j]!, members[k]!], meta, config));
      }
    }
  }
  all.sort((a, b) => b.total - a.total);
  return { top: all.slice(0, topK), teamsScored: all.length };
}
