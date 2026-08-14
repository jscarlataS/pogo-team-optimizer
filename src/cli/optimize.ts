import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings1500 } from "../data/pvpoke.js";
import { loadRoster } from "../roster.js";
import { expandRoster } from "../resolve.js";
import { PvpokeSim } from "../sim/harness.js";
import { DEFAULT_VIABILITY, selectViableCandidates } from "../viability.js";
import { computeMatrix, DEFAULT_MATRIX } from "../matrix.js";
import { buildProfiles, DEFAULT_SCORE_CONFIG, searchTeams } from "../score.js";
import { renderReport } from "../report.js";

const USAGE = `Usage: npm run optimize [-- options]

Read the Poke Genie export and print the strongest Great League teams the
roster can actually build.

Options:
  --roster <path>     Poke Genie CSV (default data/poke_genie_export.csv)
  --teams <n>         teams to report (default 10)
  --meta <n>          opponent pool size (default ${DEFAULT_MATRIX.metaN})
  --viability-top <n> ranking entries that count as viable (default ${DEFAULT_VIABILITY.topN})
  --uniform-weights   weight meta opponents uniformly instead of by score
  --out <path>        write markdown to a file (default stdout)
  --json              emit raw TeamScore JSON instead of markdown
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
      teams: { type: "string", default: "10" },
      meta: { type: "string", default: String(DEFAULT_MATRIX.metaN) },
      "viability-top": { type: "string", default: String(DEFAULT_VIABILITY.topN) },
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
  const topTeams = positiveInt("teams", values.teams);
  const metaN = positiveInt("meta", values.meta);
  const viabilityTop = positiveInt("viability-top", values["viability-top"]);
  const log = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };

  const roster = loadRoster(values.roster);
  const gm = loadGamemaster();
  const rankings = loadRankings1500();
  log(`roster: ${roster.length} scanned mons`);

  const sim = new PvpokeSim();
  const candidates = expandRoster(roster, gm);
  const { viable, infeasible, outclassed } = selectViableCandidates(
    candidates,
    rankings,
    sim,
    { topN: viabilityTop },
  );
  log(
    `viability: ${candidates.length} candidates → ${viable.length} viable ` +
      `(${infeasible.length} infeasible, ${outclassed.length} outclassed duplicates)`,
  );
  if (viable.length < 3) {
    throw new Error(
      `Only ${viable.length} viable candidates — not enough for a team. ` +
        `Widen --viability-top or scan more of the box.`,
    );
  }

  const matrix = computeMatrix(viable, rankings, sim, gm.timestamp, { metaN }, log);

  const scoreConfig = {
    ...DEFAULT_SCORE_CONFIG,
    opponentWeighting: values["uniform-weights"] ? ("uniform" as const) : ("score" as const),
  };
  const { members, meta } = buildProfiles(viable, matrix, rankings, scoreConfig);
  const { top, teamsScored } = searchTeams(members, meta, scoreConfig, topTeams);
  log(`search: ${teamsScored.toLocaleString()} teams scored`);

  const output = values.json
    ? JSON.stringify({ top, viable: matrix.candidates }, null, 2)
    : renderReport({
        rosterSize: roster.length,
        candidateCount: candidates.length,
        viable,
        infeasible,
        members,
        meta,
        rankings,
        top,
        teamsScored,
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
