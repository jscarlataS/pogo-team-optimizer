import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEAGUES, loadGamemaster, loadRankings } from "../src/data/pvpoke.js";
import { parseRosterCsv } from "../src/roster.js";
import { expandRoster } from "../src/resolve.js";
import { PvpokeSim } from "../src/sim/harness.js";
import {
  filterBudgetCandidates,
  selectReadyCandidates,
  selectViableCandidates,
} from "../src/viability.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const roster = parseRosterCsv(
  readFileSync(join(REPO_ROOT, "fixtures", "roster-sample.csv"), "utf8"),
  "fixture",
);
const gm = loadGamemaster();
const rankings = loadRankings(LEAGUES.great);
const sim = new PvpokeSim();
const result = selectViableCandidates(expandRoster(roster, gm), rankings, sim);
const viableIds = result.viable.map((v) => v.candidate.targetSpeciesId);

describe("selectViableCandidates on the fixture roster", () => {
  it("keeps the obviously meta-relevant builds", () => {
    // marowak_alolan is deliberately absent: in the vendored rankings it sits
    // below the top-100 threshold — exactly the tuning question flagged under
    // "viability threshold" in open-questions.md.
    for (const id of [
      "azumarill",
      "stunfisk_galarian",
      "sableye_shadow",
      "clodsire",
      "toxapex",
      "feraligatr_shadow",
      "ninetales_shadow",
      "medicham",
      "registeel",
      "dusknoir",
    ]) {
      expect(viableIds, id).toContain(id);
    }
  });

  it("evolves a shadow pre-evolution into its ranked shadow target", () => {
    const ninetales = result.viable.find(
      (v) => v.candidate.targetSpeciesId === "ninetales_shadow",
    );
    expect(ninetales?.candidate.owned.name).toBe("Vulpix");
    expect(ninetales?.candidate.evolutionSteps).toBe(1);
  });

  it("applies the level floor to evolution targets too (L26 Vulpix ↛ Ninetales)", () => {
    // Ninetales' optimal build for these IVs is ~L23; the scanned Vulpix is
    // already L26, so the evolution cannot legally fit under the cap. Poke
    // Genie's own analysis agreed (its GL target for this row was Vulpix).
    const ninetales = result.infeasible.find((c) => c.targetSpeciesId === "ninetales");
    expect(ninetales?.owned.cp).toBe(639);
    expect(viableIds).not.toContain("ninetales");
  });

  it("marks in-meta but unbuildable mons infeasible (Melmetal at CP 3456)", () => {
    const melmetal = result.infeasible.find((c) => c.targetSpeciesId === "melmetal");
    expect(melmetal?.owned.cp).toBe(3456);
    expect(viableIds).not.toContain("melmetal");
  });

  it("silently skips sub-meta species (Seadra itself)", () => {
    // Its evolution Kingdra IS top-100 — and lands in `infeasible` because the
    // scanned Seadra's L25 floor is above Kingdra's optimal GL level.
    expect(viableIds).not.toContain("seadra");
    expect(result.infeasible.map((c) => c.targetSpeciesId)).not.toContain("seadra");
    expect(result.infeasible.some((c) => c.targetSpeciesId === "kingdra")).toBe(true);
  });

  it("marks over-cap specimens infeasible (Lapras 0/0/5 already at CP 1956)", () => {
    const lapras = result.infeasible.find((c) => c.targetSpeciesId === "lapras");
    expect(lapras?.owned.cp).toBe(1956);
    expect(viableIds).not.toContain("lapras");
  });

  it("builds respect the cap and the level floor", () => {
    for (const v of result.viable) {
      expect(v.build.cp).toBeLessThanOrEqual(1500);
      expect(v.build.level).toBeGreaterThanOrEqual(v.candidate.owned.level);
    }
  });

  it("keeps rank order", () => {
    const ranks = result.viable.map((v) => v.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});

describe("selectReadyCandidates (zero-investment tier) on the fixture roster", () => {
  const ready = selectReadyCandidates(expandRoster(roster, gm), rankings, sim);
  const readyIds = ready.viable.map((v) => v.candidate.targetSpeciesId);

  it("keeps only current-form, under-cap, meta-relevant mons", () => {
    for (const id of [
      "altaria",
      "azumarill",
      "dusknoir",
      "medicham",
      "registeel",
      "sableye_shadow",
      "stunfisk_galarian",
    ]) {
      expect(readyIds, id).toContain(id);
    }
    // Evolution targets are not "existing" mons…
    for (const id of ["ninetales", "ninetales_shadow", "clodsire", "toxapex"]) {
      expect(readyIds, id).not.toContain(id);
    }
    // …and over-cap mons cannot enter the league at all.
    expect(readyIds).not.toContain("melmetal");
    expect(readyIds).not.toContain("lapras");
  });

  it("builds at the scanned level and reproduces the scanned CP", () => {
    for (const v of ready.viable) {
      expect(v.build.level, v.candidate.targetSpeciesId).toBe(v.candidate.owned.level);
      expect(v.build.cp, v.candidate.targetSpeciesId).toBe(v.candidate.owned.cp);
    }
  });

  it("collects over-cap meta forms as infeasible", () => {
    const ids = ready.infeasible.map((c) => c.targetSpeciesId);
    expect(ids).toContain("melmetal");
    expect(ids).toContain("lapras");
  });
});

describe("filterBudgetCandidates (little-power-ups tier)", () => {
  const budget = filterBudgetCandidates(result.viable, 5);
  const budgetIds = budget.map((v) => v.candidate.targetSpeciesId);

  it("keeps near-ready builds and drops big projects", () => {
    expect(budgetIds).toContain("stunfisk_galarian"); // Δ0 levels
    expect(budgetIds).toContain("registeel"); // Δ2
    expect(budgetIds).toContain("altaria"); // already near its optimal level
    expect(budgetIds).not.toContain("sableye_shadow"); // Δ36.5, deep XL
    expect(budgetIds).not.toContain("azumarill"); // Δ~21.5
    expect(budgetIds).not.toContain("medicham"); // Δ~30, XL
  });

  it("enforces both the level delta and the XL bound", () => {
    for (const v of budget) {
      expect(v.build.level - v.candidate.owned.level).toBeLessThanOrEqual(5);
      expect(v.build.level).toBeLessThanOrEqual(40);
    }
  });
});
