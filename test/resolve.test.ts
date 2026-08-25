import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadGamemaster } from "../src/data/pvpoke.js";
import type { Gamemaster } from "../src/data/pvpoke.js";
import { deriveBaseName, sameSpeciesName } from "../src/species.js";
import { defaultRosterPath, loadRoster, parseRosterCsv } from "../src/roster.js";
import type { LeagueAnalysis, OwnedPokemon } from "../src/roster.js";
import {
  expandFamily,
  expandRoster,
  KNOWN_DANGLING_EVOLUTIONS,
  resolveSpeciesId,
} from "../src/resolve.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// Same file the CLIs default to: the newest export in data/ (absent on CI).
const REAL_CSV = ((): string => {
  try {
    return defaultRosterPath().path;
  } catch {
    return "";
  }
})();

const gm = loadGamemaster();
const fixtureRoster = parseRosterCsv(
  readFileSync(join(REPO_ROOT, "fixtures", "roster-sample.csv"), "utf8"),
  "fixture",
);

const fakeMon = (over: Partial<OwnedPokemon>): OwnedPokemon => ({
  id: "t", name: "X", form: "", dex: 0, cp: 100, hp: 10,
  ivs: { atk: 0, def: 0, hp: 0 }, level: 10, lucky: false, shadow: false,
  scannedAt: "", originalScannedAt: "", dust: 0, ...over,
});

const REGION_TAGS = ["alolan", "galarian", "hisuian", "paldean"];
const regionOfId = (speciesId: string): string | null => {
  const tags = gm.pokemonById.get(speciesId)?.tags ?? [];
  return REGION_TAGS.find((t) => tags.includes(t)) ?? null;
};
const FORM_TO_REGION = new Map<string, string | null>([
  ["", null], ["normal", null], ["alola", "alolan"],
  ["galar", "galarian"], ["hisui", "hisuian"], ["paldea", "paldean"],
]);

// Poke Genie's own per-league target (Name (G|U)/Form (G|U)) acts as an
// independently computed oracle for the family expansion: whatever it deemed
// that league's family member must be among our candidates, matched by
// base name + regional form. (Its shadow column is unverified — not asserted.)
function expansionCoversPokeGenieTarget(
  mon: OwnedPokemon,
  g: Gamemaster,
  block: LeagueAnalysis | undefined,
): boolean {
  if (!block) {
    return true;
  }
  const wantName = block.targetName;
  const wantRegion = FORM_TO_REGION.get(block.targetForm.toLowerCase());
  const wanted = (speciesId: string): boolean => {
    const entry = g.pokemonById.get(speciesId);
    return (
      entry !== undefined &&
      sameSpeciesName(deriveBaseName(entry.speciesName), wantName) &&
      regionOfId(speciesId) === (wantRegion ?? null)
    );
  };
  const candidates = expandFamily(mon, g);
  if (candidates.some((c) => wanted(c.targetSpeciesId))) {
    return true;
  }
  // PG may name a target reachable only through a vendor-dangling evolution id
  // (a shadow Scyther's "Kleavor": kleavor_shadow has no gamemaster entry, so
  // expansion rightly skips it). Accept when stripping _shadow off a dangling
  // id named by a candidate's family lands on the wanted species.
  return candidates.some((c) =>
    (g.pokemonById.get(c.targetSpeciesId)!.family?.evolutions ?? []).some(
      (evoId) =>
        KNOWN_DANGLING_EVOLUTIONS.has(evoId) &&
        wanted(evoId.replace(/_shadow$/, "")),
    ),
  );
}

describe("resolveSpeciesId", () => {
  it("resolves the fixture roster to the expected ids", () => {
    const expectations: Record<string, string> = {
      "Dwebble-249": "dwebble_shadow",
      "Mareanie-272": "mareanie",
      "Stunfisk-1478": "stunfisk_galarian",
      "Marowak-1017": "marowak_alolan",
      "Dusknoir-1122": "dusknoir",
      "Registeel-1352": "registeel",
      "Melmetal-3456": "melmetal",
      "Medicham-599": "medicham",
      "Vulpix-195": "vulpix_shadow",
      "Vulpix-639": "vulpix",
      "Altaria-1475": "altaria",
      "Wooper-355": "wooper_paldean",
      "Totodile-209": "totodile_shadow",
      "Sableye-318": "sableye_shadow",
      "Azumarill-673": "azumarill",
      "Seadra-1483": "seadra",
      "Lapras-1956": "lapras",
    };
    for (const mon of fixtureRoster) {
      expect(resolveSpeciesId(mon, gm), `${mon.name}-${mon.cp}`).toBe(
        expectations[`${mon.name}-${mon.cp}`],
      );
    }
  });

  it("fails loudly on ambiguous multi-form species (Castform)", () => {
    expect(() =>
      resolveSpeciesId(fakeMon({ name: "Castform", dex: 351 }), gm),
    ).toThrow(/RESOLVE_OVERRIDES/);
  });

  it("resolves observed non-regional formes via RESOLVE_OVERRIDES", () => {
    // Form values from the 2026-08-14 UL scanning pass.
    expect(resolveSpeciesId(fakeMon({ name: "Giratina", dex: 487, form: "Origin" }), gm)).toBe(
      "giratina_origin",
    );
    expect(resolveSpeciesId(fakeMon({ name: "Giratina", dex: 487, form: "Altered" }), gm)).toBe(
      "giratina_altered",
    );
    expect(resolveSpeciesId(fakeMon({ name: "Zygarde", dex: 718, form: "10%" }), gm)).toBe(
      "zygarde_10",
    );
  });
});

describe("expandFamily", () => {
  const targets = (mon: OwnedPokemon): string[] =>
    expandFamily(mon, gm).map((c) => c.targetSpeciesId);

  it("follows pre-wired shadow lineages", () => {
    expect(targets(fixtureRoster.find((m) => m.name === "Dwebble")!)).toEqual([
      "dwebble_shadow",
      "crustle_shadow",
    ]);
  });

  it("walks two evolution steps with step counts", () => {
    const cands = expandFamily(fixtureRoster.find((m) => m.name === "Totodile")!, gm);
    expect(
      cands.map((c) => [c.targetSpeciesId, c.evolutionSteps]),
    ).toEqual([
      ["totodile_shadow", 0],
      ["croconaw_shadow", 1],
      ["feraligatr_shadow", 2],
    ]);
  });

  it("never changes regional form on evolution (Cubone ↛ Alolan Marowak)", () => {
    expect(targets(fakeMon({ name: "Cubone", dex: 104 }))).toEqual([
      "cubone",
      "marowak",
    ]);
    expect(targets(fakeMon({ name: "Cubone", dex: 104, shadow: true }))).toEqual([
      "cubone_shadow",
      "marowak_shadow",
    ]);
  });

  it("crosses into untagged converging lines (Paldean Wooper → Clodsire)", () => {
    expect(targets(fixtureRoster.find((m) => m.name === "Wooper")!)).toEqual([
      "wooper_paldean",
      "clodsire",
    ]);
  });

  it("expands branching families (Eevee → 8 evolutions)", () => {
    expect(targets(fakeMon({ name: "Eevee", dex: 133 }))).toHaveLength(9);
  });

  it("skips known-dangling vendor evolution ids, keeps the rest of the family", () => {
    // scyther.family names kleavor (exists); scyther_shadow.family names
    // kleavor_shadow (no gamemaster entry — verified vendor gap).
    expect(targets(fakeMon({ name: "Scyther", dex: 123 }))).toEqual([
      "scyther",
      "scizor",
      "kleavor",
    ]);
    expect(targets(fakeMon({ name: "Scyther", dex: 123, shadow: true }))).toEqual([
      "scyther_shadow",
      "scizor_shadow",
    ]);
  });

  it("covers Poke Genie's own GL and UL targets for every fixture row", () => {
    for (const mon of fixtureRoster) {
      expect(
        expansionCoversPokeGenieTarget(mon, gm, mon.greatLeague),
        `${mon.name}-${mon.cp} (G)`,
      ).toBe(true);
      expect(
        expansionCoversPokeGenieTarget(mon, gm, mon.ultraLeague),
        `${mon.name}-${mon.cp} (U)`,
      ).toBe(true);
    }
  });
});

describe.skipIf(!existsSync(REAL_CSV))("real export resolution", () => {
  it("resolves and expands every row, agreeing with Poke Genie's GL and UL targets", () => {
    const roster = loadRoster(REAL_CSV);
    const candidates = expandRoster(roster, gm); // throws on any unresolved row
    expect(candidates.length).toBeGreaterThan(roster.length);
    let glChecked = 0;
    let ulChecked = 0;
    for (const mon of roster) {
      expect(
        expansionCoversPokeGenieTarget(mon, gm, mon.greatLeague),
        `${mon.name}-${mon.cp} (G)`,
      ).toBe(true);
      expect(
        expansionCoversPokeGenieTarget(mon, gm, mon.ultraLeague),
        `${mon.name}-${mon.cp} (U)`,
      ).toBe(true);
      if (mon.greatLeague) glChecked++;
      if (mon.ultraLeague) ulChecked++;
    }
    // The oracle only bites where the blocks exist — make sure it actually did.
    expect(glChecked).toBeGreaterThan(100);
    expect(ulChecked).toBeGreaterThan(100);
  });
});
