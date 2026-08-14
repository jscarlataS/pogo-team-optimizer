import { readFileSync } from "node:fs";

// Parser for the Poke Genie "Scan Pro" CSV export. The 49-column layout below
// was verified against a real export on 2026-08-14 and is recorded in
// docs/reference/data-sources.md. The header is asserted verbatim so that an
// app update changing the export fails loudly here instead of silently
// misreading columns downstream.
const EXPECTED_HEADER: readonly string[] = [
  "Index", "Name", "Form", "Pokemon Number", "Gender", "CP", "HP",
  "Atk IV", "Def IV", "Sta IV", "IV Avg", "Level Min", "Level Max",
  "Quick Move", "Charge Move", "Charge Move 2",
  "Scan Date", "Original Scan Date", "Catch Date", "Weight", "Height",
  "Lucky", "Shadow/Purified", "Favorite", "Dust",
  "Rank % (G)", "Rank # (G)", "Stat Prod (G)", "Dust Cost (G)",
  "Candy Cost (G)", "Name (G)", "Form (G)", "Sha/Pur (G)",
  "Rank % (U)", "Rank # (U)", "Stat Prod (U)", "Dust Cost (U)",
  "Candy Cost (U)", "Name (U)", "Form (U)", "Sha/Pur (U)",
  "Rank % (L)", "Rank # (L)", "Stat Prod (L)", "Dust Cost (L)",
  "Candy Cost (L)", "Name (L)", "Form (L)", "Sha/Pur (L)",
  "Marked for PvP use",
];

/**
 * Poke Genie's own per-league PvP analysis block. `targetName`/`targetForm`
 * name the family member it evaluated for the league (e.g. Dwebble → Crustle),
 * which the pipeline uses only as a cross-check oracle for its own family
 * expansion, plus the build costs for reporting.
 */
export interface LeagueAnalysis {
  /** IV rank percentile for the suggested build, e.g. 51.72 for "51.72%". */
  rankPct: number;
  rankNum: number;
  statProdPct: number;
  dustCost: number;
  candyCost: number;
  targetName: string;
  targetForm: string;
  /** 0/1/2 — semantics unverified (open-questions.md); do not build on it. */
  shaPur: number;
}

export interface OwnedPokemon {
  /** Synthetic, content-derived; stable across re-exports of unchanged mons. */
  id: string;
  name: string;
  /** Raw CSV form: "" | "Normal" (both = base) | "Alola" | "Galar" | "Paldea". */
  form: string;
  dex: number;
  cp: number;
  hp: number;
  /** Exact in this export (verified); `hp` is the CSV's "Sta IV". */
  ivs: { atk: number; def: number; hp: number };
  /** Current level; a floor for builds, since levels cannot go down. */
  level: number;
  lucky: boolean;
  shadow: boolean;
  scannedAt: string;
  originalScannedAt: string;
  /** Dust cost of the next power-up at the current level. */
  dust: number;
  /** Absent iff current CP already exceeds 1500 (verified equivalence). */
  greatLeague?: LeagueAnalysis;
}

function rowError(source: string, line: number, detail: string): Error {
  return new Error(
    `Bad Poke Genie CSV row in ${source} (line ${line}): ${detail}. If the ` +
      `export format changed, re-verify it against docs/reference/data-sources.md.`,
  );
}

/** Minimal RFC-4180-ish line splitter: quoted fields, "" escapes, no newlines inside fields. */
function splitCsvLine(line: string, source: string, lineNo: number): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw rowError(source, lineNo, "unterminated quoted field");
  }
  fields.push(field);
  return fields;
}

function parseIntField(raw: string, name: string, source: string, lineNo: number): number {
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n)) {
    throw rowError(source, lineNo, `${name} should be an integer, got "${raw}"`);
  }
  return n;
}

function parseFlag(raw: string, name: string, source: string, lineNo: number): boolean {
  if (raw !== "0" && raw !== "1") {
    throw rowError(
      source,
      lineNo,
      `${name} should be 0 or 1, got "${raw}"` +
        (name === "Shadow/Purified"
          ? " — the purified encoding is unverified (see open-questions.md); " +
            "observe what the app exports for a purified mon before accepting it"
          : ""),
    );
  }
  return raw === "1";
}

function parseIv(raw: string, name: string, source: string, lineNo: number): number {
  const n = parseIntField(raw, name, source, lineNo);
  if (n < 0 || n > 15) {
    throw rowError(source, lineNo, `${name} should be 0–15, got ${n}`);
  }
  return n;
}

function parseLeagueBlock(
  get: (name: string) => string,
  suffix: string,
  source: string,
  lineNo: number,
): LeagueAnalysis | undefined {
  const rankPctRaw = get(`Rank % (${suffix})`);
  const cols = [
    `Rank % (${suffix})`, `Rank # (${suffix})`, `Stat Prod (${suffix})`,
    `Dust Cost (${suffix})`, `Candy Cost (${suffix})`, `Name (${suffix})`,
    `Sha/Pur (${suffix})`,
  ];
  if (rankPctRaw === "") {
    // Verified: a league block is either fully absent or fully present
    // (Form may legitimately be empty either way).
    const stragglers = cols.filter((c) => get(c) !== "");
    if (stragglers.length > 0) {
      throw rowError(
        source,
        lineNo,
        `league block (${suffix}) is partially filled (${stragglers.join(", ")})`,
      );
    }
    return undefined;
  }
  const pct = (name: string): number => {
    const raw = get(name);
    if (!raw.endsWith("%")) {
      throw rowError(source, lineNo, `${name} should end with %, got "${raw}"`);
    }
    const n = Number(raw.slice(0, -1));
    if (!Number.isFinite(n)) {
      throw rowError(source, lineNo, `${name} is not numeric: "${raw}"`);
    }
    return n;
  };
  const targetName = get(`Name (${suffix})`);
  if (targetName === "") {
    throw rowError(source, lineNo, `league block (${suffix}) lacks a target name`);
  }
  return {
    rankPct: pct(`Rank % (${suffix})`),
    rankNum: parseIntField(get(`Rank # (${suffix})`), `Rank # (${suffix})`, source, lineNo),
    statProdPct: pct(`Stat Prod (${suffix})`),
    dustCost: parseIntField(get(`Dust Cost (${suffix})`), `Dust Cost (${suffix})`, source, lineNo),
    candyCost: parseIntField(get(`Candy Cost (${suffix})`), `Candy Cost (${suffix})`, source, lineNo),
    targetName,
    targetForm: get(`Form (${suffix})`),
    shaPur: parseIntField(get(`Sha/Pur (${suffix})`), `Sha/Pur (${suffix})`, source, lineNo),
  };
}

export function parseRosterCsv(text: string, source: string): OwnedPokemon[] {
  const lines = text.split(/\r?\n/).filter((l, i, arr) => !(l === "" && i === arr.length - 1));
  if (lines.length < 2) {
    throw new Error(`${source} has no data rows — expected a Poke Genie export.`);
  }
  const header = splitCsvLine(lines[0]!, source, 1);
  if (
    header.length !== EXPECTED_HEADER.length ||
    header.some((h, i) => h !== EXPECTED_HEADER[i])
  ) {
    throw new Error(
      `${source} header does not match the verified Poke Genie layout ` +
        `(expected ${EXPECTED_HEADER.length} columns starting "Index,Name,Form,…"). ` +
        `The app's export format has likely changed — re-verify against ` +
        `docs/reference/data-sources.md before trusting any parse.`,
    );
  }
  const col = new Map(header.map((h, i) => [h, i]));

  const roster: OwnedPokemon[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const fields = splitCsvLine(lines[i]!, source, lineNo);
    if (fields.length !== EXPECTED_HEADER.length) {
      throw rowError(
        source,
        lineNo,
        `expected ${EXPECTED_HEADER.length} fields, got ${fields.length}`,
      );
    }
    const get = (name: string): string => fields[col.get(name)!]!;

    const levelMin = get("Level Min");
    const levelMax = get("Level Max");
    if (levelMin !== levelMax) {
      // Never observed in the verified export. If Poke Genie ever emits a
      // range (ambiguous detail-only scan), that is new information — stop
      // and extend the model rather than silently picking an end.
      throw rowError(
        source,
        lineNo,
        `Level Min "${levelMin}" != Level Max "${levelMax}" — IV/level ranges are ` +
          `not modelled because the verified export never contained one`,
      );
    }
    const level = Number(levelMin);
    if (!Number.isFinite(level) || level < 1 || level > 55 || (level * 2) % 1 !== 0) {
      throw rowError(source, lineNo, `implausible level "${levelMin}"`);
    }

    const mon: OwnedPokemon = {
      id: "",
      name: get("Name"),
      form: get("Form"),
      dex: parseIntField(get("Pokemon Number"), "Pokemon Number", source, lineNo),
      cp: parseIntField(get("CP"), "CP", source, lineNo),
      hp: parseIntField(get("HP"), "HP", source, lineNo),
      ivs: {
        atk: parseIv(get("Atk IV"), "Atk IV", source, lineNo),
        def: parseIv(get("Def IV"), "Def IV", source, lineNo),
        hp: parseIv(get("Sta IV"), "Sta IV", source, lineNo),
      },
      level,
      lucky: parseFlag(get("Lucky"), "Lucky", source, lineNo),
      shadow: parseFlag(get("Shadow/Purified"), "Shadow/Purified", source, lineNo),
      scannedAt: get("Scan Date"),
      originalScannedAt: get("Original Scan Date"),
      dust: parseIntField(get("Dust"), "Dust", source, lineNo),
    };
    if (mon.name === "") {
      throw rowError(source, lineNo, "empty Name");
    }
    const gl = parseLeagueBlock(get, "G", source, lineNo);
    if (gl !== undefined) {
      mon.greatLeague = gl;
    }

    mon.id = [
      mon.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      mon.form.toLowerCase() || "base",
      mon.cp,
      mon.hp,
      `${mon.ivs.atk}-${mon.ivs.def}-${mon.ivs.hp}`,
    ].join("-");

    const prev = seen.get(mon.id);
    if (prev !== undefined) {
      // The verified export has one row per physical mon (rescans update in
      // place). A duplicate means the export semantics changed — investigate,
      // don't guess which row is current.
      throw rowError(
        source,
        lineNo,
        `duplicate of line ${prev} (same name/form/CP/HP/IVs: ${mon.id})`,
      );
    }
    seen.set(mon.id, lineNo);
    roster.push(mon);
  }
  return roster;
}

export function loadRoster(path: string): OwnedPokemon[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `Cannot read roster CSV at ${path}. Export it from Poke Genie ` +
        `(Scan Pro) and drop it there — see docs/roadmap.md.`,
      { cause },
    );
  }
  return parseRosterCsv(raw, path);
}
