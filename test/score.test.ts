import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORE_CONFIG,
  scoreTeam,
  searchTeams,
} from "../src/score.js";
import type { MemberProfile, MetaProfile } from "../src/score.js";

// Pure-function tests with synthetic profiles: no simulator, no vendor data.
// Real-data behaviour is exercised end to end by the optimize CLI.

const meta: MetaProfile = { ids: ["o1", "o2"], weights: [0.5, 0.5] };

function mkMember(over: Partial<MemberProfile> & { speciesId: string; index: number }): MemberProfile {
  return {
    categoryScores: [100, 100, 100, 100, 100, 100],
    defensiveMultipliers: { fire: 1, water: 1 },
    weightedRating: [1000, 1000],
    ...over,
  };
}

const perfect: [MemberProfile, MemberProfile, MemberProfile] = [
  mkMember({ speciesId: "a", index: 0 }),
  mkMember({ speciesId: "b", index: 1 }),
  mkMember({ speciesId: "c", index: 2 }),
];

describe("scoreTeam", () => {
  it("scores a perfect team 100 with all components at 1", () => {
    const s = scoreTeam(perfect, meta);
    expect(s.total).toBeCloseTo(100, 5);
    for (const v of Object.values(s.components)) {
      expect(v).toBeCloseTo(1, 9);
    }
    expect(s.losses).toEqual([]);
    expect(s.sharedWeaknesses).toEqual([]);
  });

  it("records an unanswered opponent as a loss and degrades coverage + threat", () => {
    const team: typeof perfect = [
      mkMember({ speciesId: "a", index: 0, weightedRating: [1000, 200] }),
      mkMember({ speciesId: "b", index: 1, weightedRating: [1000, 300] }),
      mkMember({ speciesId: "c", index: 2, weightedRating: [1000, 400] }),
    ];
    const s = scoreTeam(team, meta);
    expect(s.losses).toEqual(["o2"]);
    expect(s.components.coverage).toBeCloseTo(0.5 + 0.5 * 0.4, 9);
    // severity vs o2: mean((300+200+100)/500 /3) = 0.4, weighted 0.5
    expect(s.components.threat).toBeCloseTo(1 - 0.2, 9);
    expect(s.total).toBeCloseTo(100 * 0.7 ** 0.35 * 0.8 ** 0.2, 6);
  });

  it("prefers a role-diverse team over three pure leads", () => {
    const pureLead = (id: string, i: number): MemberProfile =>
      mkMember({ speciesId: id, index: i, categoryScores: [100, 10, 10, 10, 10, 100] });
    const threeLeads = scoreTeam([pureLead("a", 0), pureLead("b", 1), pureLead("c", 2)], meta);
    const diverse = scoreTeam(
      [
        mkMember({ speciesId: "a", index: 0, categoryScores: [100, 10, 10, 10, 10, 100] }),
        mkMember({ speciesId: "b", index: 1, categoryScores: [10, 10, 100, 10, 10, 100] }),
        mkMember({ speciesId: "c", index: 2, categoryScores: [10, 100, 10, 10, 10, 100] }),
      ],
      meta,
    );
    expect(threeLeads.components.roles).toBeCloseTo(Math.cbrt(1 * 0.1 * 0.1), 9);
    expect(diverse.components.roles).toBeCloseTo(1, 9);
    expect(diverse.total).toBeGreaterThan(threeLeads.total);
    expect(diverse.roleAssignment).toEqual({ lead: "a", swap: "b", closer: "c" });
  });

  it("penalizes a shared triple weakness harder than a double", () => {
    const weakTo = (mult: number): Record<string, number> => ({ fire: mult, water: 1 });
    const withWeak = (mults: [number, number, number]): number =>
      scoreTeam(
        [
          mkMember({ speciesId: "a", index: 0, defensiveMultipliers: weakTo(mults[0]) }),
          mkMember({ speciesId: "b", index: 1, defensiveMultipliers: weakTo(mults[1]) }),
          mkMember({ speciesId: "c", index: 2, defensiveMultipliers: weakTo(mults[2]) }),
        ],
        meta,
      ).components.weakness;
    expect(withWeak([1, 1, 1])).toBeCloseTo(1, 9);
    expect(withWeak([1.6, 1.6, 1])).toBeCloseTo(0.9, 9);
    expect(withWeak([1.6, 1.6, 1.6])).toBeCloseTo(0.6, 9);
    const triple = scoreTeam(
      [
        mkMember({ speciesId: "a", index: 0, defensiveMultipliers: weakTo(2.56) }),
        mkMember({ speciesId: "b", index: 1, defensiveMultipliers: weakTo(1.6) }),
        mkMember({ speciesId: "c", index: 2, defensiveMultipliers: weakTo(1.6) }),
      ],
      meta,
    );
    expect(triple.sharedWeaknesses).toEqual(["fire"]);
  });

  it("weights opponents by the meta profile", () => {
    const lopsided: MetaProfile = { ids: ["o1", "o2"], weights: [0.9, 0.1] };
    const team: typeof perfect = [
      mkMember({ speciesId: "a", index: 0, weightedRating: [0, 1000] }),
      mkMember({ speciesId: "b", index: 1, weightedRating: [0, 1000] }),
      mkMember({ speciesId: "c", index: 2, weightedRating: [0, 1000] }),
    ];
    expect(scoreTeam(team, lopsided).components.coverage).toBeCloseTo(0.1, 9);
  });
});

describe("searchTeams", () => {
  it("enumerates C(n,3) and ranks the dominant triple first", () => {
    const strong = (id: string, i: number): MemberProfile => mkMember({ speciesId: id, index: i });
    const weak = (id: string, i: number): MemberProfile =>
      mkMember({ speciesId: id, index: i, weightedRating: [100, 100], categoryScores: [20, 20, 20, 20, 20, 20] });
    const pool = [strong("s1", 0), strong("s2", 1), weak("w1", 2), strong("s3", 3), weak("w2", 4)];
    const { top, teamsScored } = searchTeams(pool, meta, DEFAULT_SCORE_CONFIG, 3);
    expect(teamsScored).toBe(10);
    expect(top[0]!.speciesIds).toEqual(["s1", "s2", "s3"]);
    expect(top).toHaveLength(3);
    expect(top[0]!.total).toBeGreaterThanOrEqual(top[1]!.total);
  });
});
