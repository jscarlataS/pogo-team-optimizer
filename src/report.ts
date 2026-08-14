import type { Gamemaster, RankingEntry } from "./data/pvpoke.js";
import { deriveBaseName } from "./species.js";
import type { Candidate } from "./resolve.js";
import type { MemberProfile, MetaProfile, ScoreConfig, TeamScore } from "./score.js";
import type { ViableCandidate } from "./viability.js";
import type { PvpokeSim } from "./sim/harness.js";

// Stage 6: the human-facing output. Every recommendation carries its component
// breakdown so a bad team is debuggable, the costs to actually build it, and
// the in-game search string to find the physical mons.

export interface ReportInputs {
  rosterSize: number;
  candidateCount: number;
  viable: readonly ViableCandidate[];
  infeasible: readonly Candidate[];
  members: readonly MemberProfile[];
  meta: MetaProfile;
  rankings: readonly RankingEntry[];
  top: readonly TeamScore[];
  teamsScored: number;
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

function buildCostLine(v: ViableCandidate, gm: Gamemaster): string {
  const o = v.candidate.owned;
  const parts: string[] = [];
  if (v.candidate.evolutionSteps > 0) {
    parts.push(`evolve ×${v.candidate.evolutionSteps}`);
  }
  // Poke Genie's dust/candy figures apply when its suggested GL target is the
  // same family member we chose (matched by base name + form-insensitive).
  const target = gm.pokemonById.get(v.candidate.targetSpeciesId);
  const pg = o.greatLeague;
  if (pg && target && deriveBaseName(target.speciesName) === pg.targetName) {
    if (pg.dustCost > 0 || pg.candyCost > 0) {
      parts.push(`${pg.dustCost.toLocaleString()} dust + ${pg.candyCost} candy`);
    } else {
      parts.push("already at optimal level");
    }
  }
  if (v.ranking.moveset.length > 2) {
    const unlock = (v.build as { thirdMoveCost?: number }).thirdMoveCost ?? 0;
    if (unlock > 0) {
      parts.push(`2nd charged move: ${unlock.toLocaleString()} dust`);
    }
  }
  if (v.build.level > 40) {
    parts.push("needs XL candy");
  }
  const pools = v.build as { eliteMoves?: string[]; legacyMoves?: string[] };
  const special = v.ranking.moveset.filter(
    (m) => pools.eliteMoves?.includes(m) || pools.legacyMoves?.includes(m),
  );
  if (special.length > 0) {
    parts.push(`Elite TM: ${special.map(prettyMove).join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "ready as-is";
}

function teamSection(
  n: number,
  team: TeamScore,
  inputs: ReportInputs,
): string {
  const { viable, gm, config, sim } = inputs;
  const memberViable = team.indices.map((i) => viable[i]!);
  const names = memberViable.map((v) => displayName(v.candidate.targetSpeciesId, gm));
  const lines: string[] = [];
  lines.push(`## ${n}. ${names.join(" + ")} — ${team.total.toFixed(1)}`);
  lines.push("");
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
        `; ${buildCostLine(v, gm)}`,
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

export function renderReport(inputs: ReportInputs): string {
  const { top, viable, infeasible, meta, config, teamsScored, gm } = inputs;
  const sections: string[] = [];
  sections.push("# Great League teams from your roster");
  sections.push("");
  sections.push(
    `- Pipeline: ${inputs.rosterSize} scanned mons → ${inputs.candidateCount} ` +
      `family-expanded candidates → **${viable.length} viable builds** → ` +
      `${teamsScored.toLocaleString()} teams scored`,
  );
  sections.push(
    `- Meta: top ${meta.ids.length} GL ranking entries, ` +
      `${config.opponentWeighting === "score" ? "score-weighted" : "uniformly weighted"}; ` +
      `shield scenarios 0v0/1v1/2v2 weighted ` +
      `${config.shieldWeights["0v0"]}/${config.shieldWeights["1v1"]}/${config.shieldWeights["2v2"]}`,
  );
  sections.push(
    `- Movesets are PvPoke's ranked sets (the export carries none) — the ` +
      `moves listed per member are the TM targets`,
  );
  sections.push(`- Gamemaster ${inputs.gamemasterTimestamp}; ratings >500 are wins`);
  sections.push("");

  top.forEach((team, i) => {
    sections.push(teamSection(i + 1, team, inputs));
    sections.push("");
  });

  // Which physical mons keep showing up → Milestone 4's appraisal shortlist.
  const appearances = new Map<string, number>();
  for (const team of top) {
    for (const i of team.indices) {
      const id = viable[i]!.candidate.targetSpeciesId;
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
      sections.push(`- ${displayName(id, gm)} — in ${n} of the top ${top.length} teams`);
    }
    sections.push("");
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
