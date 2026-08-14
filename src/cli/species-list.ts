import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings1500 } from "../data/pvpoke.js";
import { collectBaseSpecies } from "../species.js";
import type { BaseSpecies } from "../species.js";
import { chunkTerms, joinChunk } from "../searchString.js";

const USAGE = `Usage: npm run species-list [-- options]

Emit in-game search strings covering the Great League meta, for filtering the
box down to what is worth scanning.

Options:
  --top <n>          ranking entries to cover (default 100)
  --chunk-chars <n>  max characters per pasteable chunk (default 200 — conservative
                     until the real in-game cap is measured)
  --format <f>       names | dex | both (default both)
  --out <path>       write markdown to a file instead of stdout
  --help             show this help
`;

function parsePositiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--${name} must be a positive integer, got "${value}"`);
  }
  return n;
}

function renderChunks(terms: readonly string[], maxChars: number): string {
  const chunks = chunkTerms(terms, maxChars);
  const parts = chunks.map((chunk, i) => {
    const last = chunk[chunk.length - 1]!;
    return [
      `**Chunk ${i + 1} of ${chunks.length}** — ${chunk.length} species, ` +
        `ends with \`${last}\` (check that one still matches after pasting):`,
      "",
      "```",
      joinChunk(chunk),
      "```",
    ].join("\n");
  });
  return parts.join("\n\n");
}

function renderReport(opts: {
  topN: number;
  chunkChars: number;
  format: "names" | "dex" | "both";
  species: readonly BaseSpecies[];
  timestamp: string;
  warnings: readonly string[];
}): string {
  const { topN, chunkChars, format, species, timestamp, warnings } = opts;
  const nameTerms = species.map((s) => s.baseName);
  const dexTerms = species.map((s) => String(s.dex));

  const sections: string[] = [];
  sections.push(
    `# Great League top ${topN} — in-game search strings`,
    "",
    `- Source: PvPoke \`rankings/all/overall/rankings-1500.json\` (vendored; gamemaster timestamp ${timestamp})`,
    `- ${topN} ranking entries collapse to **${species.length} base species** ` +
      `(shadows, regionals, and forms merged by dex number), listed in rank order ` +
      `so a truncated paste still keeps the most meta-relevant species`,
    `- Chunk budget: ${chunkChars} characters`,
  );

  if (warnings.length > 0) {
    sections.push(
      "",
      "## ⚠ Warnings",
      "",
      ...warnings.map((w) => `- ${w}`),
    );
  }

  if (format !== "dex") {
    sections.push("", "## Species names", "", renderChunks(nameTerms, chunkChars));
  }
  if (format !== "names") {
    sections.push("", "## Dex numbers", "", renderChunks(dexTerms, chunkChars));
  }

  sections.push(
    "",
    "## Full uncapped strings",
    "",
    "For binary-searching the real character cap, if you want to pin it down:",
    "",
    "```",
    nameTerms.join(","),
    "```",
    "",
    "```",
    dexTerms.join(","),
    "```",
  );

  sections.push(
    "",
    "## Manual in-game test checklist",
    "",
    "These resolve the open items in `docs/reference/open-questions.md` — record",
    "the observed behaviour there afterwards.",
    "",
    "1. **OR semantics** — paste `azumarill,medicham,lanturn`. Expect: only those",
    "   three species (any variant: shadow, lucky, etc.). Anything else appearing,",
    "   or nothing appearing, means commas do not mean OR.",
    "2. **Prefix/substring matching** — search `mew`. Note whether Mewtwo (and",
    "   anything else) matches; this tells us how much noise name strings admit.",
    "3. **Silent truncation** — paste each chunk above and check its labelled last",
    "   species still matches (own one, or watch the shown count change as you",
    "   shorten the string). If the last species of a chunk is missing, the field",
    "   cut the string: lower `--chunk-chars` and rerun.",
    "4. **Coverage** — with a chunk pasted, the box should show only species from",
    "   this list. That is Milestone 1's done-criterion.",
    "",
  );

  return sections.join("\n");
}

function main(): void {
  const { values } = parseArgs({
    options: {
      top: { type: "string", default: "100" },
      "chunk-chars": { type: "string", default: "200" },
      format: { type: "string", default: "both" },
      out: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const requestedTop = parsePositiveInt("top", values.top);
  const chunkChars = parsePositiveInt("chunk-chars", values["chunk-chars"]);
  const format = values.format;
  if (format !== "names" && format !== "dex" && format !== "both") {
    throw new Error(`--format must be names, dex, or both, got "${format}"`);
  }

  const rankings = loadRankings1500();
  const topN = Math.min(requestedTop, rankings.length);
  if (topN < requestedTop) {
    process.stderr.write(
      `note: only ${rankings.length} ranking entries exist; using all of them\n`,
    );
  }
  const gm = loadGamemaster();
  const { species, warnings } = collectBaseSpecies(rankings.slice(0, topN), gm);

  for (const warning of warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }

  const report = renderReport({
    topN,
    chunkChars,
    format,
    species,
    timestamp: gm.timestamp,
    warnings,
  });

  if (values.out !== undefined) {
    const outPath = resolve(values.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, report);
    process.stdout.write(`Wrote ${outPath}\n`);
  } else {
    process.stdout.write(report);
  }
}

main();
