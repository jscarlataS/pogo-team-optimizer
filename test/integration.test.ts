import { describe, expect, it } from "vitest";
import { LEAGUES, loadGamemaster, loadRankings } from "../src/data/pvpoke.js";
import { collectBaseSpecies } from "../src/species.js";
import { chunkTerms, joinChunk } from "../src/searchString.js";

// Deliberate drift detection: the vendored PvPoke copy is pinned (commit
// e5ee9b7672, gamemaster 2026-08-13), so these numbers are stable. If a vendor
// refresh changes them, that is exactly the moment to re-verify shapes against
// docs/reference/data-sources.md — a red test here is working as intended.
describe("top-100 Great League pipeline", () => {
  const rankings = loadRankings(LEAGUES.great);
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

describe("top-100 Ultra League pipeline", () => {
  const rankings = loadRankings(LEAGUES.ultra);
  const gm = loadGamemaster();
  const { species, warnings } = collectBaseSpecies(rankings.slice(0, 100), gm);

  it("loads the full rankings file", () => {
    expect(rankings).toHaveLength(841);
  });

  it("collapses the top 100 entries to 70 base species", () => {
    expect(species).toHaveLength(70);
  });

  it("keeps rank order (Mimikyu is #1 in Ultra too)", () => {
    expect(species[0]).toEqual({ dex: 778, baseName: "Mimikyu" });
  });

  it("flags Kommo-o — the first non-plain-letter name — and stays comma-safe", () => {
    // The GL top 100 was all plain letters; UL is not. The hyphen is harmless
    // in a comma-separated search string, but the warning must surface it
    // rather than silently assuming the GL invariant.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Kommo-o/);
    for (const s of species) {
      expect(s.baseName).toMatch(/^[A-Za-z-]+$/);
      expect(s.baseName).not.toContain(",");
    }
  });
});
