import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings1500 } from "../data/pvpoke.js";
import { loadRoster } from "../roster.js";
import { expandRoster } from "../resolve.js";
import { PvpokeSim } from "../sim/harness.js";
import { DEFAULT_VIABILITY, selectViableCandidates } from "../viability.js";

// Stage-3 checkpoint (roadmap, merged milestone): print the viable candidate
// list for eyeballing before any team search exists. If the obvious mons are
// missing here, everything downstream is wrong.

const USAGE = `Usage: npm run candidates [-- options]

Options:
  --roster <path>  Poke Genie CSV (default data/poke_genie_export.csv)
  --top <n>        ranking entries that count as the meta (default 100)
  --help
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      roster: { type: "string", default: "data/poke_genie_export.csv" },
      top: { type: "string", default: String(DEFAULT_VIABILITY.topN) },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  const topN = Number(values.top);
  if (!Number.isInteger(topN) || topN < 1) {
    throw new Error(`--top must be a positive integer, got "${values.top}"`);
  }

  const roster = loadRoster(values.roster);
  const gm = loadGamemaster();
  const rankings = loadRankings1500();
  const sim = new PvpokeSim();
  const candidates = expandRoster(roster, gm);
  const { viable, infeasible, outclassed } = selectViableCandidates(
    candidates,
    rankings,
    sim,
    { topN },
  );

  process.stdout.write(
    `${roster.length} scanned mons → ${candidates.length} family-expanded candidates → ` +
      `${viable.length} viable (meta top ${topN})\n\n`,
  );
  const pad = (s: string | number, n: number): string => String(s).padEnd(n);
  process.stdout.write(
    `${pad("rank", 5)}${pad("target", 28)}${pad("score", 7)}${pad("from (scanned)", 26)}` +
      `${pad("build", 14)}${pad("evolve", 7)}XL\n`,
  );
  for (const v of viable) {
    const o = v.candidate.owned;
    process.stdout.write(
      `${pad(v.rank, 5)}${pad(v.candidate.targetSpeciesId, 28)}${pad(v.ranking.score, 7)}` +
        `${pad(`${o.name} CP${o.cp} L${o.level} ${o.ivs.atk}/${o.ivs.def}/${o.ivs.hp}`, 26)}` +
        `${pad(`L${v.build.level} CP${v.build.cp}`, 14)}` +
        `${pad(v.candidate.evolutionSteps || "-", 7)}${v.build.level > 40 ? "XL" : ""}\n`,
    );
  }
  if (infeasible.length > 0) {
    process.stdout.write(`\nMeta-relevant but no legal build (over the cap):\n`);
    for (const c of infeasible) {
      process.stdout.write(
        `  ${c.targetSpeciesId} from ${c.owned.name} CP${c.owned.cp} L${c.owned.level}\n`,
      );
    }
  }
  if (outclassed.length > 0) {
    process.stdout.write(
      `\n${outclassed.length} duplicate-species builds dropped for a better specimen ` +
        `(rerun with --top to widen, or see viability.ts).\n`,
    );
  }
}

main();
