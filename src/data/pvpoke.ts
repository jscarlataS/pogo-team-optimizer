import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths from the repo root so the CLI works from any cwd.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(REPO_ROOT, "vendor", "pvpoke", "src", "data");

export const GAMEMASTER_PATH = join(DATA_DIR, "gamemaster.json");
export const RANKINGS_1500_PATH = join(
  DATA_DIR,
  "rankings",
  "all",
  "overall",
  "rankings-1500.json",
);

// Only the fields this project actually consumes. The real files carry many
// more keys (documented in docs/reference/data-sources.md); loaders narrow to
// these so nothing downstream can quietly depend on an unverified field.
export interface RankingEntry {
  speciesId: string;
  score: number;
}

export interface GamemasterPokemon {
  speciesId: string;
  dex: number;
  speciesName: string;
  aliasId?: string;
}

export interface Gamemaster {
  timestamp: string;
  pokemonById: ReadonlyMap<string, GamemasterPokemon>;
}

function shapeError(file: string, detail: string): Error {
  return new Error(
    `Unexpected shape in ${file}: ${detail}. PvPoke data has drifted from what ` +
      `docs/reference/data-sources.md records — re-verify before building on it.`,
  );
}

function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `Cannot read ${path} — is the PvPoke vendor checkout present? ` +
        `(See docs/reference/data-sources.md for how it was vendored.)`,
      { cause },
    );
  }
  return JSON.parse(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadRankings1500(): RankingEntry[] {
  const data = readJson(RANKINGS_1500_PATH);
  if (!Array.isArray(data) || data.length === 0) {
    throw shapeError(RANKINGS_1500_PATH, "expected a non-empty array");
  }
  const entries = data.map((raw, i): RankingEntry => {
    if (!isRecord(raw) || typeof raw.speciesId !== "string" || !Number.isFinite(raw.score)) {
      throw shapeError(
        RANKINGS_1500_PATH,
        `entry ${i} lacks a string speciesId and finite numeric score`,
      );
    }
    return { speciesId: raw.speciesId, score: raw.score as number };
  });
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.score > entries[i - 1]!.score) {
      throw shapeError(
        RANKINGS_1500_PATH,
        `entries are not sorted by score descending (index ${i})`,
      );
    }
  }
  return entries;
}

export function loadGamemaster(): Gamemaster {
  const data = readJson(GAMEMASTER_PATH);
  if (!isRecord(data) || typeof data.timestamp !== "string") {
    throw shapeError(GAMEMASTER_PATH, "expected an object with a string timestamp");
  }
  if (!Array.isArray(data.pokemon) || data.pokemon.length === 0) {
    throw shapeError(GAMEMASTER_PATH, "expected a non-empty pokemon array");
  }
  const pokemonById = new Map<string, GamemasterPokemon>();
  data.pokemon.forEach((raw, i) => {
    if (
      !isRecord(raw) ||
      typeof raw.speciesId !== "string" ||
      typeof raw.speciesName !== "string" ||
      !Number.isInteger(raw.dex) ||
      (raw.aliasId !== undefined && typeof raw.aliasId !== "string")
    ) {
      throw shapeError(
        GAMEMASTER_PATH,
        `pokemon[${i}] lacks the expected speciesId/speciesName/dex/aliasId shape`,
      );
    }
    if (pokemonById.has(raw.speciesId)) {
      throw shapeError(GAMEMASTER_PATH, `duplicate speciesId "${raw.speciesId}"`);
    }
    pokemonById.set(raw.speciesId, {
      speciesId: raw.speciesId,
      dex: raw.dex as number,
      speciesName: raw.speciesName,
      ...(raw.aliasId !== undefined ? { aliasId: raw.aliasId } : {}),
    });
  });
  return { timestamp: data.timestamp, pokemonById };
}
