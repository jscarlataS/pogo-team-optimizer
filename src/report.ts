import type { Gamemaster, RankingEntry } from "./data/pvpoke.js";
import { deriveBaseName } from "./species.js";
import type { Candidate } from "./resolve.js";
import type { MetaProfile, ScoreConfig, TeamScore } from "./score.js";
import type { ViableCandidate } from "./viability.js";
import type { PvpokeSim } from "./sim/harness.js";

// Stage 6: the human-facing output. Teams come in three resource tiers —
// optimal (no constraints), budget (small power-ups only), and ready-now
// (existing mons, zero investment). Every recommendation carries its
// component breakdown so a bad team is debuggable, the costs to actually
// build it, and the in-game search string to find the physical mons.

export type TierKey = "optimal" | "budget" | "ready";

export interface TierSection {
  key: TierKey;
  title: string;
  description: string;
  /** The viable list that this tier's TeamScore.indices refer to. */
  viable: readonly ViableCandidate[];
  /** Best teams, already limited to the per-tier count. */
  top: readonly TeamScore[];
  poolSize: number;
  /** Set when the tier could not produce teams (pool < 3). */
  skippedReason?: string;
}

export interface ReportInputs {
  rosterSize: number;
  candidateCount: number;
  tiers: readonly TierSection[];
  /** Optimal-tier infeasible list (mons over the cap even at best build). */
  infeasible: readonly Candidate[];
  meta: MetaProfile;
  rankings: readonly RankingEntry[];
  config: ScoreConfig;
  sim: PvpokeSim;
  gm: Gamemaster;
  gamemasterTimestamp: string;
}

const prettyMove = (id: string): string =>
  id
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");

const pct = (v: number): string => (v * 100).toFixed(1);

function displayName(speciesId: string, gm: Gamemaster): string {
  return gm.pokemonById.get(speciesId)?.speciesName ?? speciesId;
}

function secondMoveUnlock(v: ViableCandidate): number {
  if (v.ranking.moveset.length <= 2) {
    return 0;
  }
  return (v.build as { thirdMoveCost?: number }).thirdMoveCost ?? 0;
}

function eliteTmMoves(v: ViableCandidate): string[] {
  const pools = v.build as { eliteMoves?: string[]; legacyMoves?: string[] };
  return v.ranking.moveset.filter(
    (m) => pools.eliteMoves?.includes(m) || pools.legacyMoves?.includes(m),
  );
}

function buildCostLine(v: ViableCandidate, gm: Gamemaster, tier: TierKey): string {
  const parts: string[] = [];
  if (tier === "ready") {
    parts.push("used as-is, no power-ups");
    const unlock = secondMoveUnlock(v);
    if (unlock > 0) {
      parts.push(
        `2nd charged move assumed unlocked (${unlock.toLocaleString()} dust if not)`,
      );
    }
  } else {
    const o = v.candidate.owned;
    if (v.candidate.evolutionSteps > 0) {
      parts.push(`evolve ×${v.candidate.evolutionSteps}`);
    }
    // Poke Genie's dust/candy figures apply when its suggested GL target is
    // the same family member we chose (matched by base name).
    const target = gm.pokemonById.get(v.candidate.targetSpeciesId);
    const pg = o.greatLeague;
    if (pg && target && deriveBaseName(target.speciesName) === pg.targetName) {
      if (pg.dustCost > 0 || pg.candyCost > 0) {
        parts.push(`${pg.dustCost.toLocaleString()} dust + ${pg.candyCost} candy`);
      } else {
        parts.push("already at optimal level");
      }
    } else if (v.build.level > v.candidate.owned.level) {
      parts.push(
        `power up L${v.candidate.owned.level} → L${v.build.level}`,
      );
    }
    const unlock = secondMoveUnlock(v);
    if (unlock > 0) {
      parts.push(`2nd charged move: ${unlock.toLocaleString()} dust`);
    }
    if (v.build.level > 40) {
      parts.push("needs XL candy");
    }
  }
  const special = eliteTmMoves(v);
  if (special.length > 0) {
    parts.push(`Elite TM: ${special.map(prettyMove).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "ready as-is";
}

function teamDetail(team: TeamScore, tier: TierSection, inputs: ReportInputs): string {
  const { gm, config, sim } = inputs;
  const memberViable = team.indices.map((i) => tier.viable[i]!);
  const lines: string[] = [];
  const c = team.components;
  const w = config.componentWeights;
  lines.push(
    `Score parts (× weight): coverage ${pct(c.coverage)} (${w.coverage}) · ` +
      `threat ${pct(c.threat)} (${w.threat}) · weakness ${pct(c.weakness)} (${w.weakness}) · ` +
      `roles ${pct(c.roles)} (${w.roles}) · consistency ${pct(c.consistency)} (${w.consistency})`,
  );
  lines.push("");
  for (const v of memberViable) {
    const o = v.candidate.owned;
    const moves = v.ranking.moveset.map(prettyMove);
    lines.push(
      `- **${displayName(v.candidate.targetSpeciesId, gm)}** ` +
        `(from ${o.name} CP${o.cp} L${o.level} ${o.ivs.atk}/${o.ivs.def}/${o.ivs.hp})` +
        ` — build L${v.build.level} CP${v.build.cp}; ${moves[0]} + ${moves.slice(1).join(" / ")}` +
        `; ${buildCostLine(v, gm, tier.key)}`,
    );
  }
  lines.push("");
  lines.push(
    `Roles: lead **${displayName(team.roleAssignment.lead, gm)}** · ` +
      `safe swap **${displayName(team.roleAssignment.swap, gm)}** · ` +
      `closer **${displayName(team.roleAssignment.closer, gm)}**`,
  );
  if (team.sharedWeaknesses.length > 0) {
    lines.push(`⚠ All three weak to: **${team.sharedWeaknesses.join(", ")}**`);
  }
  if (team.losses.length > 0) {
    const shown = team.losses.slice(0, 8).map((id) => displayName(id, gm));
    lines.push(
      `Unanswered meta threats (${team.losses.length}): ${shown.join(", ")}` +
        (team.losses.length > 8 ? ", …" : ""),
    );
  } else {
    lines.push("No unanswered meta threats in the pool.");
  }
  const searchTerms = [...new Set(memberViable.map((v) => v.candidate.owned.name))];
  lines.push("");
  lines.push(`In-game search: \`${searchTerms.join(",")}\``);
  lines.push(`[PvPoke Team Builder](${sim.teamBuilderUrl(memberViable.map((v) => v.build))})`);
  return lines.join("\n");
}

function tierSection(tier: TierSection, inputs: ReportInputs): string {
  const { gm } = inputs;
  const lines: string[] = [];
  lines.push(`## ${tier.title}`);
  lines.push("");
  lines.push(tier.description);
  lines.push("");
  if (tier.skippedReason !== undefined || tier.top.length === 0) {
    lines.push(`_${tier.skippedReason ?? "No teams found."}_`);
    return lines.join("\n");
  }
  const best = tier.top[0]!;
  const names = best.indices.map((i) =>
    displayName(tier.viable[i]!.candidate.targetSpeciesId, gm),
  );
  lines.push(`### ${names.join(" + ")} — ${best.total.toFixed(1)}`);
  lines.push("");
  lines.push(teamDetail(best, tier, inputs));
  if (tier.top.length > 1) {
    lines.push("");
    lines.push("Also strong in this tier:");
    tier.top.slice(1).forEach((team, i) => {
      const alt = team.indices.map((idx) =>
        displayName(tier.viable[idx]!.candidate.targetSpeciesId, gm),
      );
      lines.push(`${i + 2}. ${alt.join(" + ")} — ${team.total.toFixed(1)}`);
    });
  }
  return lines.join("\n");
}

export function renderReport(inputs: ReportInputs): string {
  const { tiers, infeasible, meta, config, gm } = inputs;
  const sections: string[] = [];
  sections.push("# Great League teams from your roster");
  sections.push("");
  const optimal = tiers.find((t) => t.key === "optimal");
  sections.push(
    `- Pipeline: ${inputs.rosterSize} scanned mons → ${inputs.candidateCount} ` +
      `family-expanded candidates → pools: ` +
      tiers.map((t) => `${t.poolSize} ${t.key}`).join(", "),
  );
  sections.push(
    `- Meta: top ${meta.ids.length} GL ranking entries, ` +
      `${config.opponentWeighting === "score" ? "score-weighted" : "uniformly weighted"}; ` +
      `shield scenarios 0v0/1v1/2v2 weighted ` +
      `${config.shieldWeights["0v0"]}/${config.shieldWeights["1v1"]}/${config.shieldWeights["2v2"]}`,
  );
  sections.push(
    `- Movesets are PvPoke's ranked sets (the export carries none) — listed ` +
      `moves are the TM targets`,
  );
  sections.push(`- Gamemaster ${inputs.gamemasterTimestamp}; ratings >500 are wins`);
  sections.push("");

  for (const tier of tiers) {
    sections.push(tierSection(tier, inputs));
    sections.push("");
  }

  // Which species keep showing up in the optimal tier → M4 appraisal shortlist.
  if (optimal && optimal.top.length > 0) {
    const appearances = new Map<string, number>();
    for (const team of optimal.top) {
      for (const i of team.indices) {
        const id = optimal.viable[i]!.candidate.targetSpeciesId;
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      }
    }
    const recurring = [...appearances.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, n]) => n > 1);
    if (recurring.length > 0) {
      sections.push("## Recurring members (Milestone 4 appraisal shortlist)");
      sections.push("");
      for (const [id, n] of recurring) {
        sections.push(
          `- ${displayName(id, gm)} — in ${n} of the top ${optimal.top.length} optimal teams`,
        );
      }
      sections.push("");
    }
  }

  if (infeasible.length > 0) {
    sections.push("## Meta-relevant but unbuildable (already over 1500)");
    sections.push("");
    for (const c of infeasible) {
      sections.push(
        `- ${displayName(c.targetSpeciesId, gm)} from ${c.owned.name} ` +
          `CP${c.owned.cp} L${c.owned.level}`,
      );
    }
    sections.push("");
  }
  return sections.join("\n");
}
