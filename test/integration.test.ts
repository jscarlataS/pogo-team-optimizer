import { describe, expect, it } from "vitest";
import { loadGamemaster, loadRankings1500 } from "../src/data/pvpoke.js";
import { collectBaseSpecies } from "../src/species.js";
import { chunkTerms, joinChunk } from "../src/searchString.js";

// Deliberate drift detection: the vendored PvPoke copy is pinned (commit
// e5ee9b7672, gamemaster 2026-08-13), so these numbers are stable. If a vendor
// refresh changes them, that is exactly the moment to re-verify shapes against
// docs/reference/data-sources.md — a red test here is working as intended.
describe("top-100 Great League pipeline", () => {
  const rankings = loadRankings1500();
  const gm = loadGamemaster();
  const { species, warnings } = collectBaseSpecies(rankings.slice(0, 100), gm);

  it("loads the full rankings file", () => {
    expect(rankings).toHaveLength(1143);
  });

  it("collapses the top 100 entries to 73 base species with no warnings", () => {
    expect(species).toHaveLength(73);
    expect(warnings).toEqual([]);
  });

  it("keeps rank order (Mimikyu is the current #1)", () => {
    expect(species[0]).toEqual({ dex: 778, baseName: "Mimikyu" });
  });

  it("produces only plain-letter names, safe for a comma-separated string", () => {
    for (const s of species) {
      expect(s.baseName).toMatch(/^[A-Za-z]+$/);
    }
  });

  it("chunks names and dex numbers losslessly within the default budget", () => {
    for (const terms of [
      species.map((s) => s.baseName),
      species.map((s) => String(s.dex)),
    ]) {
      const chunks = chunkTerms(terms, 200);
      expect(chunks.flat()).toEqual(terms);
      for (const chunk of chunks) {
        expect(joinChunk(chunk).length).toBeLessThanOrEqual(200);
      }
    }
  });
});
