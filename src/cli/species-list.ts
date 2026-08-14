import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings } from "../data/pvpoke.js";
import type { League } from "../data/pvpoke.js";
import { parseLeague } from "./common.js";
import { loadRoster } from "../roster.js";
import { collectBaseSpecies } from "../species.js";
import type { BaseSpecies } from "../species.js";
import { chunkTerms, joinChunk } from "../searchString.js";

const USAGE = `Usage: npm run species-list [-- options]

Emit in-game search strings covering the chosen league's meta, for filtering
the box down to what is worth scanning.

Options:
  --league <l>       great (default) or ultra — which meta to cover
  --top <n>          ranking entries to cover (default 100)
  --chunk-chars <n>  max characters per pasteable chunk (default 200 — conservative
                     until the real in-game cap is measured)
  --format <f>       names | dex | both (default both)
  --exclude-scanned <csv>
                     also emit a "new species only" section: species (by dex)
                     with no specimen in this Poke Genie export yet
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
  league: League;
  topN: number;
  chunkChars: number;
  format: "names" | "dex" | "both";
  species: readonly BaseSpecies[];
  newOnly?: { species: readonly BaseSpecies[]; rosterPath: string };
  timestamp: string;
  warnings: readonly string[];
}): string {
  const { league, topN, chunkChars, format, species, newOnly, timestamp, warnings } = opts;
  const nameTerms = species.map((s) => s.baseName);
  const dexTerms = species.map((s) => String(s.dex));

  const sections: string[] = [];
  sections.push(
    `# ${league.label} top ${topN} — in-game search strings`,
    "",
    `- Source: PvPoke \`rankings/all/overall/rankings-${league.cap}.json\` (vendored; gamemaster timestamp ${timestamp})`,
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

  if (newOnly !== undefined) {
    sections.push(
      "",
      `## New species only — nothing scanned yet (vs \`${newOnly.rosterPath}\`)`,
      "",
      `${newOnly.species.length} of the ${species.length} species above have no ` +
        `specimen in the export. Scanning passes are additive — never wipe Poke ` +
        `Genie, just scan and re-export. Note the match is by dex number: a ` +
        `species listed as scanned may still hide unscanned specimens worth ` +
        `scanning (other regional forms, or newly caught higher-CP ones).`,
      "",
    );
    if (newOnly.species.length === 0) {
      sections.push("_Every species in this list already has at least one scan._");
    } else {
      sections.push(
        "### Names",
        "",
        renderChunks(newOnly.species.map((s) => s.baseName), chunkChars),
        "",
        "### Dex numbers",
        "",
        renderChunks(newOnly.species.map((s) => String(s.dex)), chunkChars),
      );
    }
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
    "Most of the original checklist is resolved (see `docs/reference/open-questions.md`):",
    "commas are OR, the full un-chunked list pasted without truncation, and chunk",
    "coverage was verified during the Great League scanning pass. Still open,",
    "cosmetic only:",
    "",
    "1. **Prefix/substring matching** — search `mew`. Note whether Mewtwo (and",
    "   anything else) matches; this tells us how much noise name strings admit.",
    "",
    "Tip while scanning: the game's search also filters by CP — appending a range",
    "like `&cp1500-2500` should show only specimens in the Ultra band (standard",
    "GO search syntax, untested by us; verify once before relying on it).",
    "",
  );

  return sections.join("\n");
}

function main(): void {
  const { values } = parseArgs({
    options: {
      league: { type: "string", default: "great" },
      top: { type: "string", default: "100" },
      "chunk-chars": { type: "string", default: "200" },
      format: { type: "string", default: "both" },
      "exclude-scanned": { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const league = parseLeague(values.league);
  const requestedTop = parsePositiveInt("top", values.top);
  const chunkChars = parsePositiveInt("chunk-chars", values["chunk-chars"]);
  const format = values.format;
  if (format !== "names" && format !== "dex" && format !== "both") {
    throw new Error(`--format must be names, dex, or both, got "${format}"`);
  }

  const rankings = loadRankings(league);
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

  let newOnly: { species: BaseSpecies[]; rosterPath: string } | undefined;
  if (values["exclude-scanned"] !== undefined) {
    const rosterPath = values["exclude-scanned"];
    const scannedDexes = new Set(loadRoster(rosterPath).map((m) => m.dex));
    newOnly = {
      species: species.filter((s) => !scannedDexes.has(s.dex)),
      rosterPath,
    };
  }

  const report = renderReport({
    league,
    topN,
    chunkChars,
    format,
    species,
    ...(newOnly !== undefined ? { newOnly } : {}),
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
