import { describe, expect, it } from "vitest";
import { chunkTerms, joinChunk } from "../src/searchString.js";

const TERMS = ["Mimikyu", "Lickilicky", "Tinkaton", "Altaria", "Empoleon", "Quagsire"];

describe("chunkTerms", () => {
  it("keeps every joined chunk within the budget", () => {
    for (const max of [10, 20, 25, 200]) {
      for (const chunk of chunkTerms(TERMS, max)) {
        expect(joinChunk(chunk).length).toBeLessThanOrEqual(max);
      }
    }
  });

  it("emits every term exactly once, in order", () => {
    expect(chunkTerms(TERMS, 25).flat()).toEqual(TERMS);
  });

  it("packs to the exact boundary", () => {
    expect(chunkTerms(["ab", "cd"], 5)).toEqual([["ab", "cd"]]); // "ab,cd" = 5
    expect(chunkTerms(["ab", "cd"], 4)).toEqual([["ab"], ["cd"]]);
  });

  it("returns no chunks for no terms", () => {
    expect(chunkTerms([], 200)).toEqual([]);
  });

  it("rejects a single term longer than the budget", () => {
    expect(() => chunkTerms(["Lickilicky"], 5)).toThrow(/exceeds/);
  });

  it("rejects a nonsensical budget", () => {
    expect(() => chunkTerms(TERMS, 0)).toThrow(/positive integer/);
  });
});
