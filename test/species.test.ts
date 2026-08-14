import { describe, expect, it } from "vitest";
import { loadGamemaster } from "../src/data/pvpoke.js";
import type { RankingEntry } from "../src/data/pvpoke.js";
import { collectBaseSpecies, deriveBaseName, resolveToBase } from "../src/species.js";

// All expectations below were read from the vendored gamemaster (pinned commit,
// timestamp 2026-08-13) — see docs/reference/data-sources.md. A failure after a
// vendor refresh means the shape needs re-verification, which is intended.
const gm = loadGamemaster();

const entry = (speciesId: string): RankingEntry => ({
  speciesId,
  speciesName: "",
  score: 0,
  scores: [0, 0, 0, 0, 0, 0],
  moveset: ["FAST", "CHARGED"],
});

describe("deriveBaseName", () => {
  it("strips a single parenthesised suffix", () => {
    expect(deriveBaseName("Mimikyu (Busted)")).toBe("Mimikyu");
  });

  it("strips stacked suffixes", () => {
    expect(deriveBaseName("Sandslash (Alolan) (Shadow)")).toBe("Sandslash");
  });

  it("leaves names without parens alone, spaces included", () => {
    expect(deriveBaseName("Nidoran Female")).toBe("Nidoran Female");
  });
});

describe("resolveToBase", () => {
  it("collapses stacked regional+shadow variants to the base species", () => {
    expect(resolveToBase("sandslash_alolan_shadow", gm)).toEqual({
      dex: 28,
      baseName: "Sandslash",
    });
  });

  it("handles species that exist only as forms (no bare base entry)", () => {
    expect(resolveToBase("giratina_origin", gm)).toEqual({
      dex: 487,
      baseName: "Giratina",
    });
  });

  it("collapses cosmetic forms", () => {
    expect(resolveToBase("mimikyu_busted", gm)).toEqual({
      dex: 778,
      baseName: "Mimikyu",
    });
  });

  it("follows aliasId to the canonical entry", () => {
    expect(resolveToBase("lanturnw", gm)).toEqual(resolveToBase("lanturn", gm));
    expect(resolveToBase("cradily_b", gm)).toEqual({ dex: 346, baseName: "Cradily" });
  });

  it("fails loudly on an unknown speciesId", () => {
    expect(() => resolveToBase("definitely_not_a_pokemon", gm)).toThrow(
      /Unresolved speciesId/,
    );
  });
});

describe("collectBaseSpecies", () => {
  it("dedupes forms sharing a dex, keeping rank order", () => {
    const { species, warnings } = collectBaseSpecies(
      [entry("azumarill"), entry("ninetales"), entry("ninetales_alolan")],
      gm,
    );
    expect(species).toEqual([
      { dex: 184, baseName: "Azumarill" },
      { dex: 38, baseName: "Ninetales" },
    ]);
    expect(warnings).toEqual([]);
  });

  it("warns about names that are not plain letters", () => {
    const { species, warnings } = collectBaseSpecies([entry("nidoran_female")], gm);
    expect(species).toEqual([{ dex: 29, baseName: "Nidoran Female" }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Nidoran Female/);
  });
});
