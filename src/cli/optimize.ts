import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings1500 } from "../data/pvpoke.js";
import { loadRoster } from "../roster.js";
import { expandRoster } from "../resolve.js";
import { PvpokeSim } from "../sim/harness.js";
import {
  DEFAULT_VIABILITY,
  filterBudgetCandidates,
  selectReadyCandidates,
  selectViableCandidates,
} from "../viability.js";
import { computeMatrix, DEFAULT_MATRIX } from "../matrix.js";
import { buildProfiles, DEFAULT_SCORE_CONFIG, searchTeams } from "../score.js";
import { renderReport } from "../report.js";
import type { TierSection } from "../report.js";

const USAGE = `Usage: npm run optimize [-- options]

Read the Poke Genie export and print the strongest Great League teams the
roster can build, in three resource tiers: optimal (no constraints), budget
(small power-ups only), and ready-now (existing mons, zero investment).

Options:
  --roster <path>     Poke Genie CSV (default data/poke_genie_export.csv)
  --teams <n>         teams per tier: 1 detailed + n-1 brief (default 5)
  --meta <n>          opponent pool size (default ${DEFAULT_MATRIX.metaN})
  --viability-top <n> ranking entries that count as viable (default ${DEFAULT_VIABILITY.topN})
  --max-levelup <n>   budget tier: max levels of power-up per member (default 5)
  --uniform-weights   weight meta opponents uniformly instead of by score
  --out <path>        write markdown to a file (default stdout)
  --json              emit raw per-tier TeamScore JSON instead of markdown
  --help
`;

function positiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--${name} must be a positive integer, got "${value}"`);
  }
  return n;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      roster: { type: "string", default: "data/poke_genie_export.csv" },
      teams: { type: "string", default: "5" },
      meta: { type: "string", default: String(DEFAULT_MATRIX.metaN) },
      "viability-top": { type: "string", default: String(DEFAULT_VIABILITY.topN) },
      "max-levelup": { type: "string", default: "5" },
      "uniform-weights": { type: "boolean", default: false },
      out: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  const teamsPerTier = positiveInt("teams", values.teams);
  const metaN = positiveInt("meta", values.meta);
  const viabilityTop = positiveInt("viability-top", values["viability-top"]);
  const maxLevelUp = positiveInt("max-levelup", values["max-levelup"]);
  const log = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };

  const roster = loadRoster(values.roster);
  const gm = loadGamemaster();
  const rankings = loadRankings1500();
  log(`roster: ${roster.length} scanned mons`);

  const sim = new PvpokeSim();
  const candidates = expandRoster(roster, gm);
  const scoreConfig = {
    ...DEFAULT_SCORE_CONFIG,
    opponentWeighting: values["uniform-weights"] ? ("uniform" as const) : ("score" as const),
  };

  // Tier 1 — optimal: every candidate built to its best legal level.
  const { viable, infeasible, outclassed } = selectViableCandidates(
    candidates,
    rankings,
    sim,
    { topN: viabilityTop },
  );
  log(
    `optimal pool: ${candidates.length} candidates → ${viable.length} viable ` +
      `(${infeasible.length} infeasible, ${outclassed.length} outclassed duplicates)`,
  );
  if (viable.length < 3) {
    throw new Error(
      `Only ${viable.length} viable candidates — not enough for a team. ` +
        `Widen --viability-top or scan more of the box.`,
    );
  }
  const matrix = computeMatrix(viable, rankings, sim, gm.timestamp, { metaN }, log);
  const { members, meta } = buildProfiles(viable, matrix, rankings, scoreConfig);
  const optimalSearch = searchTeams(members, meta, scoreConfig, teamsPerTier);
  log(`optimal: ${optimalSearch.teamsScored.toLocaleString()} teams scored`);

  const tiers: TierSection[] = [
    {
      key: "optimal",
      title: "Optimal — no resource constraints",
      description:
        "Every member built to its best legal level, evolutions and " +
        "second-move unlocks included. The ceiling of this roster.",
      viable,
      top: optimalSearch.top,
      poolSize: viable.length,
    },
  ];

  // Tier 2 — budget: same builds, but only members needing small power-ups.
  const budgetViable = filterBudgetCandidates(viable, maxLevelUp);
  const budgetIndices = new Set(budgetViable.map((v) => viable.indexOf(v)));
  const budgetMembers = members.filter((m) => budgetIndices.has(m.index));
  const budgetTier: TierSection = {
    key: "budget",
    title: `Budget — at most ${maxLevelUp} levels of power-up per member`,
    description:
      `Members whose optimal build is within ${maxLevelUp} levels of their ` +
      "current level and below the XL range. Evolutions and second-move " +
      "unlocks allowed; per-member costs shown.",
    viable,
    top: [],
    poolSize: budgetMembers.length,
  };
  if (budgetMembers.length >= 3) {
    const budgetSearch = searchTeams(budgetMembers, meta, scoreConfig, teamsPerTier);
    budgetTier.top = budgetSearch.top;
    log(
      `budget (≤${maxLevelUp} levels): pool ${budgetMembers.length}, ` +
        `${budgetSearch.teamsScored.toLocaleString()} teams scored`,
    );
  } else {
    budgetTier.skippedReason =
      `Only ${budgetMembers.length} members qualify — raise --max-levelup.`;
    log(`budget (≤${maxLevelUp} levels): pool ${budgetMembers.length} — skipped`);
  }
  tiers.push(budgetTier);

  // Tier 3 — ready now: current form at current level, zero investment.
  // Different builds → its own (cached) matrix.
  const ready = selectReadyCandidates(candidates, rankings, sim, { topN: viabilityTop });
  const readyTier: TierSection = {
    key: "ready",
    title: "Ready now — existing Pokémon, zero power-ups",
    description:
      "Current form at current level: no dust, no candy, no evolutions. " +
      "Assumes the listed movesets can be TMed in place; if a second charged " +
      "move is not yet unlocked, that unlock (shown per member) is the only cost.",
    viable: ready.viable,
    top: [],
    poolSize: ready.viable.length,
  };
  if (ready.viable.length >= 3) {
    const readyMatrix = computeMatrix(
      ready.viable,
      rankings,
      sim,
      gm.timestamp,
      { metaN },
      log,
    );
    const readyProfiles = buildProfiles(ready.viable, readyMatrix, rankings, scoreConfig);
    const readySearch = searchTeams(
      readyProfiles.members,
      readyProfiles.meta,
      scoreConfig,
      teamsPerTier,
    );
    readyTier.top = readySearch.top;
    log(
      `ready-now: pool ${ready.viable.length}, ` +
        `${readySearch.teamsScored.toLocaleString()} teams scored`,
    );
  } else {
    readyTier.skippedReason =
      `Only ${ready.viable.length} mons are meta-relevant at their current ` +
      `form and level — scan or build more first.`;
    log(`ready-now: pool ${ready.viable.length} — skipped`);
  }
  tiers.push(readyTier);

  const output = values.json
    ? JSON.stringify(
        {
          tiers: tiers.map((t) => ({
            key: t.key,
            poolSize: t.poolSize,
            top: t.top,
            viable: t.viable.map((v) => v.candidate.targetSpeciesId),
          })),
        },
        null,
        2,
      )
    : renderReport({
        rosterSize: roster.length,
        candidateCount: candidates.length,
        tiers,
        infeasible,
        meta,
        rankings,
        config: scoreConfig,
        sim,
        gm,
        gamemasterTimestamp: gm.timestamp,
      });

  if (values.out !== undefined) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output);
    log(`wrote ${outPath}`);
  } else {
    process.stdout.write(output);
  }
}

main();
