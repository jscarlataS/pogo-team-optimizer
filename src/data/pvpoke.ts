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
  speciesName: string;
  score: number;
  /** [leads, closers, switches, chargers, attackers, consistency], each 0–100. */
  scores: number[];
  /** Fast move + 1–2 charged moves, UPPER_SNAKE ids — PvPoke's ranked moveset. */
  moveset: string[];
}

export interface GamemasterFamily {
  id: string;
  parent?: string;
  /** speciesIds; shadow lineages are pre-wired (dwebble_shadow → crustle_shadow). */
  evolutions?: string[];
}

export interface GamemasterPokemon {
  speciesId: string;
  dex: number;
  speciesName: string;
  aliasId?: string;
  tags?: string[];
  family?: GamemasterFamily;
  released: boolean;
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
    if (typeof raw.speciesName !== "string") {
      throw shapeError(RANKINGS_1500_PATH, `entry ${i} lacks a string speciesName`);
    }
    const { scores, moveset } = raw;
    if (
      !Array.isArray(scores) ||
      scores.length !== 6 ||
      scores.some((s) => !Number.isFinite(s))
    ) {
      throw shapeError(
        RANKINGS_1500_PATH,
        `entry ${i} ("${raw.speciesId}") lacks the 6-element numeric scores array`,
      );
    }
    if (
      !Array.isArray(moveset) ||
      moveset.length < 2 ||
      moveset.length > 3 ||
      moveset.some((m) => typeof m !== "string" || m === "")
    ) {
      throw shapeError(
        RANKINGS_1500_PATH,
        `entry ${i} ("${raw.speciesId}") lacks a 2–3 element moveset array`,
      );
    }
    return {
      speciesId: raw.speciesId,
      speciesName: raw.speciesName,
      score: raw.score as number,
      scores: scores as number[],
      moveset: moveset as string[],
    };
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
  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === "string" && s !== "");
  const isFamily = (v: unknown): v is GamemasterFamily =>
    isRecord(v) &&
    typeof v.id === "string" &&
    (v.parent === undefined || typeof v.parent === "string") &&
    (v.evolutions === undefined || isStringArray(v.evolutions));

  const pokemonById = new Map<string, GamemasterPokemon>();
  data.pokemon.forEach((raw, i) => {
    if (
      !isRecord(raw) ||
      typeof raw.speciesId !== "string" ||
      typeof raw.speciesName !== "string" ||
      !Number.isInteger(raw.dex) ||
      (raw.aliasId !== undefined && typeof raw.aliasId !== "string") ||
      typeof raw.released !== "boolean" ||
      (raw.tags !== undefined && !isStringArray(raw.tags)) ||
      (raw.family !== undefined && !isFamily(raw.family))
    ) {
      throw shapeError(
        GAMEMASTER_PATH,
        `pokemon[${i}] lacks the expected speciesId/speciesName/dex/aliasId/` +
          `released/tags/family shape`,
      );
    }
    if (pokemonById.has(raw.speciesId)) {
      throw shapeError(GAMEMASTER_PATH, `duplicate speciesId "${raw.speciesId}"`);
    }
    pokemonById.set(raw.speciesId, {
      speciesId: raw.speciesId,
      dex: raw.dex as number,
      speciesName: raw.speciesName,
      released: raw.released,
      ...(raw.aliasId !== undefined ? { aliasId: raw.aliasId } : {}),
      ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
      ...(raw.family !== undefined ? { family: raw.family } : {}),
    });
  });
  return { timestamp: data.timestamp, pokemonById };
}
