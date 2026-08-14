import { LEAGUES } from "../data/pvpoke.js";
import type { League } from "../data/pvpoke.js";

/** Shared --league flag parsing. Master League is deferred to its own chunk. */
export function parseLeague(raw: string): League {
  const byAlias: Record<string, League> = {
    great: LEAGUES.great,
    gl: LEAGUES.great,
    "1500": LEAGUES.great,
    ultra: LEAGUES.ultra,
    ul: LEAGUES.ultra,
    "2500": LEAGUES.ultra,
  };
  const league = byAlias[raw.toLowerCase()];
  if (league === undefined) {
    throw new Error(`--league must be "great" or "ultra" (aliases gl/ul), got "${raw}"`);
  }
  return league;
}
