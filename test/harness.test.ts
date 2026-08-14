import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PvpokeSim } from "../src/sim/harness.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEADS_PATH = join(
  REPO_ROOT, "vendor", "pvpoke", "src", "data", "rankings", "all", "leads", "rankings-1500.json",
);

interface LeadsEntry {
  speciesId: string;
  moveset: string[];
  matchups: Array<{ opponent: string; rating: number }>;
}

const leads: LeadsEntry[] = JSON.parse(readFileSync(LEADS_PATH, "utf8"));
const leadsById = new Map(leads.map((e) => [e.speciesId, e]));

// One shared context: constructing PvpokeSim evaluates the whole vendor bundle.
const sim = new PvpokeSim();

describe("PvpokeSim vs published PvPoke data", () => {
  it("reproduces published leads matchup ratings exactly", () => {
    // Leads scenario (verified): shields 1v1, no energy advantage. The
    // published matchup `rating` is the raw battle rating, so an exact match
    // proves the headless drive is equivalent to PvPoke's own Ranker run.
    let checked = 0;
    for (const entry of leads.slice(0, 10)) {
      for (const m of entry.matchups.slice(0, 3)) {
        const opp = leadsById.get(m.opponent);
        if (!opp) {
          continue;
        }
        const a = sim.buildPokemon({ speciesId: entry.speciesId, moveset: entry.moveset });
        const b = sim.buildPokemon({ speciesId: opp.speciesId, moveset: opp.moveset });
        const r = sim.duel(a, b, { shields: [1, 1] });
        expect(
          `${entry.speciesId} vs ${m.opponent}: ${r.rating}`,
        ).toBe(`${entry.speciesId} vs ${m.opponent}: ${m.rating}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it("applies shadow typing automatically from the species tag", () => {
    const entry = leadsById.get("sableye_shadow")!;
    const p = sim.buildPokemon({ speciesId: "sableye_shadow", moveset: entry.moveset });
    expect(p.shadowType).toBe("shadow");
  });

  it("trims the defaulted second charged move for 2-move sets", () => {
    const p = sim.buildPokemon({ speciesId: "azumarill", moveset: ["BUBBLE", "ICE_BEAM"] });
    expect(p.chargedMoves).toHaveLength(1);
  });
});

describe("real-IV builds under the 1500 cap", () => {
  it("auto-levels real IVs to the optimal level under the cap", () => {
    // Fixture Azumarill: 14/15/14 @ L15. The high attack IV inflates CP, so
    // the optimal build sits at 36.5 (pinned to the vendored CPM table).
    const p = sim.buildPokemon({
      speciesId: "azumarill",
      moveset: ["BUBBLE", "ICE_BEAM", "HYDRO_PUMP"],
      ivs: { atk: 14, def: 15, hp: 14 },
      levelFloor: 15,
    });
    expect(p).not.toBeNull();
    expect(p.cp).toBeLessThanOrEqual(1500);
    expect(p.cp).toBeGreaterThan(1400);
    expect(p.level).toBe(36.5);
    // needsXLCandy is species-level ("does the species' best league build sit
    // above 40"), not per-build — true for Azumarill even though this build
    // stops at 36.5. Per-build XL is simply level > 40.
    expect(p.needsXLCandy()).toBe(true);
  });

  it("rejects builds whose optimal level is below the current level", () => {
    // Real row: Crustle 1/1/1 already at L24 with CP 1509 — over the cap, and
    // levels cannot go down, so no legal GL build exists.
    const p = sim.buildPokemon({
      speciesId: "crustle",
      moveset: ["FURY_CUTTER", "ROCK_SLIDE", "X_SCISSOR"],
      ivs: { atk: 1, def: 1, hp: 1 },
      levelFloor: 24,
    });
    expect(p).toBeNull();
  });

  it("same IVs without the floor produce the sub-cap build", () => {
    const p = sim.buildPokemon({
      speciesId: "crustle",
      moveset: ["FURY_CUTTER", "ROCK_SLIDE", "X_SCISSOR"],
      ivs: { atk: 1, def: 1, hp: 1 },
    });
    expect(p.cp).toBeLessThanOrEqual(1500);
    expect(p.level).toBeLessThan(24);
  });
});

describe("exact-level builds (ready-now tier)", () => {
  it("reproduces the game's scanned CP exactly at the scanned level", () => {
    // (species, level, IVs, CP) straight from fixture rows of the real
    // export — the game itself computed these CPs, so equality proves the
    // vendored base stats + CPM table + our drive agree with the game.
    const cases: Array<[string, number, { atk: number; def: number; hp: number }, number]> = [
      ["azumarill", 15, { atk: 14, def: 15, hp: 14 }, 673],
      ["stunfisk_galarian", 24.5, { atk: 13, def: 13, hp: 12 }, 1478],
      ["sableye_shadow", 8, { atk: 13, def: 6, hp: 15 }, 318],
      ["registeel", 20, { atk: 12, def: 14, hp: 10 }, 1352],
    ];
    for (const [speciesId, level, ivs, cp] of cases) {
      const entry = leadsById.get(speciesId)!;
      const p = sim.buildPokemon({ speciesId, moveset: entry.moveset, ivs, exactLevel: level });
      expect(p.cp, speciesId).toBe(cp);
      expect(p.level, speciesId).toBe(level);
    }
  });

  it("requires ivs alongside exactLevel", () => {
    expect(() =>
      sim.buildPokemon({ speciesId: "azumarill", moveset: ["BUBBLE", "ICE_BEAM"], exactLevel: 15 }),
    ).toThrow(/requires ivs/);
  });
});

describe("throughput", () => {
  it("measures per-sim cost (records the last open Milestone 0 question)", () => {
    const pool = leads.slice(0, 12).map((e) =>
      sim.buildPokemon({ speciesId: e.speciesId, moveset: e.moveset }),
    );
    const scenarios: Array<[number, number]> = [[0, 0], [1, 1], [2, 2]];
    const before = sim.simCount;
    const t0 = performance.now();
    for (let i = 0; i < pool.length; i++) {
      for (let j = 0; j < pool.length; j++) {
        if (i === j) {
          continue;
        }
        sim.duel(pool[i], pool[j], { shields: scenarios[(i + j) % 3]! });
      }
    }
    const elapsed = performance.now() - t0;
    const sims = sim.simCount - before;
    const msPerSim = elapsed / sims;
    process.stdout.write(
      `\n[per-sim cost] ${sims} sims in ${elapsed.toFixed(0)}ms → ` +
        `${msPerSim.toFixed(2)}ms/sim (~${Math.round(16000 * msPerSim / 1000)}s for a 16k matrix)\n`,
    );
    expect(msPerSim).toBeLessThan(100); // order-of-magnitude tripwire only
  });
});

describe("team builder links", () => {
  it("encodes members with IVs and moves into a share URL", () => {
    const a = sim.buildPokemon({
      speciesId: "azumarill",
      moveset: ["BUBBLE", "ICE_BEAM", "HYDRO_PUMP"],
      ivs: { atk: 14, def: 15, hp: 14 },
    });
    const url = sim.teamBuilderUrl([a]);
    expect(url).toMatch(/^https:\/\/pvpoke\.com\/team-builder\/all\/1500\//);
    expect(url).toContain("azumarill");
    expect(url).toContain("-m-");
  });
});

describe("Ultra League cap (2500)", () => {
  // The whole vendor bundle is re-evaluated at the UL cap: opponent default
  // builds derive from battle.getCP(), so reproducing *published* UL ratings
  // exactly proves the cap threads through both sides of every duel.
  const UL_LEADS_PATH = join(
    REPO_ROOT, "vendor", "pvpoke", "src", "data", "rankings", "all", "leads", "rankings-2500.json",
  );
  const ulLeads: LeadsEntry[] = JSON.parse(readFileSync(UL_LEADS_PATH, "utf8"));
  const ulLeadsById = new Map(ulLeads.map((e) => [e.speciesId, e]));
  const ulSim = new PvpokeSim(2500);

  it("reproduces published UL leads matchup ratings exactly", () => {
    let checked = 0;
    for (const entry of ulLeads.slice(0, 10)) {
      for (const m of entry.matchups.slice(0, 3)) {
        const opp = ulLeadsById.get(m.opponent);
        if (!opp) {
          continue;
        }
        const a = ulSim.buildPokemon({ speciesId: entry.speciesId, moveset: entry.moveset });
        const b = ulSim.buildPokemon({ speciesId: opp.speciesId, moveset: opp.moveset });
        const r = ulSim.duel(a, b, { shields: [1, 1] });
        expect(
          `${entry.speciesId} vs ${m.opponent}: ${r.rating}`,
        ).toBe(`${entry.speciesId} vs ${m.opponent}: ${m.rating}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it("auto-levels default builds to the 2500 cap, not 1500", () => {
    const entry = ulLeadsById.get("cresselia") ?? ulLeads[0]!;
    const p = ulSim.buildPokemon({ speciesId: entry.speciesId, moveset: entry.moveset });
    expect(p.cp).toBeLessThanOrEqual(2500);
    expect(p.cp).toBeGreaterThan(1500);
  });

  it("team builder links target the 2500 cap", () => {
    const entry = ulLeads[0]!;
    const p = ulSim.buildPokemon({ speciesId: entry.speciesId, moveset: entry.moveset });
    expect(ulSim.teamBuilderUrl([p])).toMatch(
      /^https:\/\/pvpoke\.com\/team-builder\/all\/2500\//,
    );
  });
});
