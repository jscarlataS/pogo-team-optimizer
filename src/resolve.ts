import type { Gamemaster, GamemasterPokemon } from "./data/pvpoke.js";
import type { OwnedPokemon } from "./roster.js";

// Maps a scanned mon (dex + Poke Genie form string + shadow flag) to its
// gamemaster speciesId, then expands it to every family member it could be
// evolved into. The box is mostly pre-evolutions (Dwebble, Deino, Marill, …),
// so without expansion the optimizer would silently ignore most of the roster.

const REGION_TAGS = ["alolan", "galarian", "hisuian", "paldean"] as const;
type RegionTag = (typeof REGION_TAGS)[number] | null;

// Poke Genie's Form column values, verified 2026-08-14. Empty and "Normal"
// both mean the base form; Hisui is unobserved but its spelling is predictable.
const FORM_TO_REGION: ReadonlyMap<string, RegionTag> = new Map([
  ["", null],
  ["normal", null],
  ["alola", "alolan"],
  ["galar", "galarian"],
  ["hisui", "hisuian"],
  ["paldea", "paldean"],
]);

// Escape hatch for rows the dex+form+shadow rule cannot resolve unambiguously
// (multi-form species like Castform sizes, gendered entries like Meowstic).
// Key: `${dex}|${form.toLowerCase()}|${shadow ? "shadow" : "normal"}`.
// Empty so far — resolveSpeciesId fails loudly and names this map when needed.
const RESOLVE_OVERRIDES: ReadonlyMap<string, string> = new Map();

function hasTag(entry: GamemasterPokemon, tag: string): boolean {
  return entry.tags?.includes(tag) ?? false;
}

function regionOf(entry: GamemasterPokemon): RegionTag {
  return REGION_TAGS.find((t) => hasTag(entry, t)) ?? null;
}

export function resolveSpeciesId(mon: OwnedPokemon, gm: Gamemaster): string {
  const overrideKey = `${mon.dex}|${mon.form.toLowerCase()}|${mon.shadow ? "shadow" : "normal"}`;
  const override = RESOLVE_OVERRIDES.get(overrideKey);
  if (override !== undefined) {
    if (!gm.pokemonById.has(override)) {
      throw new Error(
        `RESOLVE_OVERRIDES maps ${overrideKey} to "${override}", which is not in gamemaster.json.`,
      );
    }
    return override;
  }

  const region = FORM_TO_REGION.get(mon.form.toLowerCase());
  if (region === undefined) {
    throw new Error(
      `Unknown Poke Genie form "${mon.form}" on ${mon.name} (dex ${mon.dex}) — ` +
        `extend FORM_TO_REGION in src/resolve.ts after checking gamemaster tags.`,
    );
  }

  const matches = [...gm.pokemonById.values()].filter(
    (e) =>
      e.dex === mon.dex &&
      e.aliasId === undefined && // skip duplicate cup entries (lanturnw, …)
      e.released &&
      !hasTag(e, "mega") &&
      hasTag(e, "shadow") === mon.shadow &&
      regionOf(e) === region,
  );
  if (matches.length === 1) {
    return matches[0]!.speciesId;
  }
  const ids = matches.map((e) => e.speciesId).join(", ") || "(none)";
  throw new Error(
    `Cannot resolve ${mon.name} (dex ${mon.dex}, form "${mon.form}", ` +
      `${mon.shadow ? "shadow" : "non-shadow"}) to a unique speciesId — ` +
      `candidates: ${ids}. Add a RESOLVE_OVERRIDES entry for ` +
      `"${overrideKey}" in src/resolve.ts. Refusing to drop it silently.`,
  );
}

/** One buildable configuration of an owned mon: itself, or an evolution of it. */
export interface Candidate {
  owned: OwnedPokemon;
  ownedSpeciesId: string;
  targetSpeciesId: string;
  evolutionSteps: number;
}

/**
 * The owned mon plus everything it can evolve into. gamemaster families are
 * broader than GO's evolution rules — cubone lists marowak_alolan, but in GO
 * an evolution never changes regional form — so a target is accepted only if
 * its region matches the source, or it has no regional tag at all (which
 * covers lines that converge to a single untagged form: Paldean Wooper →
 * Clodsire, Galarian Mr. Mime → Mr. Rime).
 */
export function expandFamily(mon: OwnedPokemon, gm: Gamemaster): Candidate[] {
  const ownedSpeciesId = resolveSpeciesId(mon, gm);
  const ownedEntry = gm.pokemonById.get(ownedSpeciesId)!;
  const sourceRegion = regionOf(ownedEntry);

  const candidates: Candidate[] = [
    { owned: mon, ownedSpeciesId, targetSpeciesId: ownedSpeciesId, evolutionSteps: 0 },
  ];
  const visited = new Set([ownedSpeciesId]);
  let frontier = [ownedEntry];
  for (let steps = 1; steps <= 3 && frontier.length > 0; steps++) {
    const next: GamemasterPokemon[] = [];
    for (const entry of frontier) {
      for (const evoId of entry.family?.evolutions ?? []) {
        if (visited.has(evoId)) {
          continue;
        }
        visited.add(evoId);
        const evo = gm.pokemonById.get(evoId);
        if (evo === undefined) {
          throw new Error(
            `family.evolutions of ${entry.speciesId} names "${evoId}", ` +
              `which is not in gamemaster.json.`,
          );
        }
        const evoRegion = regionOf(evo);
        if ((evoRegion !== sourceRegion && evoRegion !== null) || !evo.released) {
          continue;
        }
        next.push(evo);
        candidates.push({
          owned: mon,
          ownedSpeciesId,
          targetSpeciesId: evoId,
          evolutionSteps: steps,
        });
      }
    }
    frontier = next;
  }
  return candidates;
}

export function expandRoster(roster: readonly OwnedPokemon[], gm: Gamemaster): Candidate[] {
  return roster.flatMap((mon) => expandFamily(mon, gm));
}
