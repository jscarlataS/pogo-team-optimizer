import type { Gamemaster, RankingEntry } from "./data/pvpoke.js";

// The identity that matters for the in-game search bar: shadows, regionals,
// and cosmetic/size forms all share their base species' dex number and
// searchable name, so they are collapsed here. (Milestone 2's roster
// resolution will need the form-level identity; that is a separate mapping.)
export interface BaseSpecies {
  dex: number;
  baseName: string;
}

// speciesId -> base name, for entries whose in-game name cannot be derived by
// stripping parenthesised suffixes from PvPoke's speciesName (e.g. the game
// renders Nidoran with a gender symbol). Empty as of gamemaster 2026-08-13;
// collectBaseSpecies() warns about any candidate that shows up.
const BASE_NAME_OVERRIDES: ReadonlyMap<string, string> = new Map();

// A term we trust in a comma-separated search string without manual checking.
const SAFE_NAME = /^[A-Za-z]+$/;

// "Sandslash (Alolan) (Shadow)" -> "Sandslash", "Mimikyu (Busted)" -> "Mimikyu"
export function deriveBaseName(speciesName: string): string {
  return speciesName.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

// Poke Genie writes some names with a typographic apostrophe ("Sirfetch’d",
// U+2019) where the gamemaster uses the ASCII one ("Sirfetch'd") — observed
// 2026-08-25. Same species, different spelling, so any cross-check against
// Poke Genie's own target name has to compare on a folded form.
const APOSTROPHES = /[\u2018\u2019\u02BC\u2032]/g;

/** True when two spellings name the same species modulo apostrophe style. */
export function sameSpeciesName(a: string, b: string): boolean {
  return a.replace(APOSTROPHES, "'") === b.replace(APOSTROPHES, "'");
}

export function resolveToBase(speciesId: string, gm: Gamemaster): BaseSpecies {
  let entry = gm.pokemonById.get(speciesId);
  if (!entry) {
    throw new Error(
      `Unresolved speciesId "${speciesId}" — not present in gamemaster.json. ` +
        `Refusing to drop it silently.`,
    );
  }
  if (entry.aliasId !== undefined) {
    const target = gm.pokemonById.get(entry.aliasId);
    if (!target) {
      throw new Error(
        `speciesId "${speciesId}" aliases to "${entry.aliasId}", which is not in gamemaster.json.`,
      );
    }
    entry = target;
  }
  const override = BASE_NAME_OVERRIDES.get(entry.speciesId);
  return { dex: entry.dex, baseName: override ?? deriveBaseName(entry.speciesName) };
}

export interface SpeciesCollection {
  /** Deduped by dex, in first-appearance (i.e. rank) order. */
  species: BaseSpecies[];
  warnings: string[];
}

export function collectBaseSpecies(
  entries: readonly RankingEntry[],
  gm: Gamemaster,
): SpeciesCollection {
  const byDex = new Map<number, BaseSpecies>();
  const warnings: string[] = [];
  for (const { speciesId } of entries) {
    const base = resolveToBase(speciesId, gm);
    const seen = byDex.get(base.dex);
    if (seen === undefined) {
      byDex.set(base.dex, base);
      if (!SAFE_NAME.test(base.baseName)) {
        warnings.push(
          `"${base.baseName}" (dex ${base.dex}) contains characters beyond A-Z; ` +
            `verify it works in the in-game search bar or add a BASE_NAME_OVERRIDES entry.`,
        );
      }
    } else if (seen.baseName !== base.baseName) {
      warnings.push(
        `dex ${base.dex} maps to both "${seen.baseName}" and "${base.baseName}"; ` +
          `keeping "${seen.baseName}" (first in rank order).`,
      );
    }
  }
  return { species: [...byDex.values()], warnings };
}
