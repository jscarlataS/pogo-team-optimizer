import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadRoster, parseRosterCsv } from "../src/roster.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(REPO_ROOT, "fixtures", "roster-sample.csv");
const REAL_CSV = join(REPO_ROOT, "data", "poke_genie_export.csv");

// The fixture is a verbatim 17-row excerpt of the real 2026-08-14 export,
// chosen to cover shadows, regionals, "Normal" forms, lucky, genderless,
// rescans, an over-cap mon with no league blocks, and near-zero IVs.
const fixtureText = readFileSync(FIXTURE, "utf8");
const roster = parseRosterCsv(fixtureText, "fixture");
const byName = (name: string, cp: number) =>
  roster.find((m) => m.name === name && m.cp === cp);

describe("parseRosterCsv on the fixture excerpt", () => {
  it("parses every row", () => {
    expect(roster).toHaveLength(17);
  });

  it("reads core fields exactly (shadow Dwebble)", () => {
    const dwebble = byName("Dwebble", 249)!;
    expect(dwebble).toMatchObject({
      form: "",
      dex: 557,
      hp: 55,
      ivs: { atk: 10, def: 2, hp: 10 },
      level: 8,
      shadow: true,
      lucky: false,
    });
    expect(dwebble.greatLeague).toMatchObject({
      rankPct: 51.72,
      targetName: "Crustle",
      dustCost: 59532,
      candyCost: 130,
    });
  });

  it("omits the league block for a mon over the 1500 cap", () => {
    expect(byName("Melmetal", 3456)!.greatLeague).toBeUndefined();
  });

  it("keeps Poke Genie's own-league target even when unranked (Vulpix)", () => {
    expect(byName("Vulpix", 639)!.greatLeague?.targetName).toBe("Vulpix");
  });

  it("reads lucky and rescan timestamps", () => {
    expect(byName("Altaria", 1475)!.lucky).toBe(true);
    const rescanned = byName("Dusknoir", 1122)!;
    expect(rescanned.scannedAt).not.toBe(rescanned.originalScannedAt);
  });

  it("reads regional forms as raw CSV strings", () => {
    expect(byName("Stunfisk", 1478)!.form).toBe("Galar");
    expect(byName("Marowak", 1017)!.form).toBe("Alola");
    expect(byName("Wooper", 355)!.form).toBe("Paldea");
    expect(byName("Medicham", 599)!.form).toBe("Normal");
  });
});

// Synthetic rows for failure modes: build a full 49-field row from the real
// header so the tests break if the verified layout constant drifts.
const headerLine = fixtureText.split("\n")[0]!;
const headers = headerLine.split(",");
function mkRow(over: Record<string, string>): string {
  const base: Record<string, string> = {
    Index: "1", Name: "Azumarill", "Pokemon Number": "184", Gender: "♀",
    CP: "673", HP: "123", "Atk IV": "14", "Def IV": "15", "Sta IV": "14",
    "IV Avg": "95.6", "Level Min": "15.0", "Level Max": "15.0",
    "Scan Date": '"2026-08-14 14:58"', "Original Scan Date": '"2026-08-14 14:58"',
    Lucky: "0", "Shadow/Purified": "0", Favorite: "0", Dust: "1900",
    "Rank % (G)": "37.22%", "Rank # (G)": "2572", "Stat Prod (G)": "93.70%",
    "Dust Cost (G)": "182400", "Candy Cost (G)": "180", "Name (G)": "Azumarill",
    "Sha/Pur (G)": "0",
  };
  return headers.map((h) => over[h] ?? base[h] ?? "").join(",");
}
const csvOf = (...rows: string[]): string => [headerLine, ...rows].join("\n");

describe("parseRosterCsv failure modes", () => {
  it("accepts the synthetic baseline row", () => {
    expect(parseRosterCsv(csvOf(mkRow({})), "t")).toHaveLength(1);
  });

  it("rejects a drifted header", () => {
    const drifted = csvOf(mkRow({})).replace("Atk IV", "Attack IV");
    expect(() => parseRosterCsv(drifted, "t")).toThrow(/header does not match/);
  });

  it("rejects a level range (never observed; not modelled)", () => {
    expect(() =>
      parseRosterCsv(csvOf(mkRow({ "Level Max": "16.0" })), "t"),
    ).toThrow(/Level Min/);
  });

  it("rejects the unverified purified encoding", () => {
    expect(() =>
      parseRosterCsv(csvOf(mkRow({ "Shadow/Purified": "2" })), "t"),
    ).toThrow(/purified encoding is unverified/);
  });

  it("rejects duplicate physical mons regardless of Index", () => {
    expect(() =>
      parseRosterCsv(csvOf(mkRow({}), mkRow({ Index: "2" })), "t"),
    ).toThrow(/duplicate of line 2/);
  });

  it("rejects out-of-range IVs", () => {
    expect(() => parseRosterCsv(csvOf(mkRow({ "Atk IV": "16" })), "t")).toThrow(/0–15/);
  });

  it("rejects a partially filled league block", () => {
    expect(() =>
      parseRosterCsv(csvOf(mkRow({ "Rank % (G)": "" })), "t"),
    ).toThrow(/partially filled/);
  });
});

describe.skipIf(!existsSync(REAL_CSV))("real export (data/, gitignored)", () => {
  it("parses all 149 rows with the verified cap↔block equivalence", () => {
    const real = loadRoster(REAL_CSV);
    expect(real).toHaveLength(149);
    for (const mon of real) {
      expect(mon.greatLeague !== undefined).toBe(mon.cp <= 1500);
    }
  });
});
