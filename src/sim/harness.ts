import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { GAMEMASTER_PATH } from "../data/pvpoke.js";

// Headless driver for PvPoke's vendored battle code. The vendor files share
// browser globals instead of using modules, so they are evaluated in one vm
// context with the minimal shims recorded in docs/reference/data-sources.md
// ("Headless driving details"). Nothing here reimplements battle logic — the
// hard constraint is that PvPoke's own Battle.js does all simulation.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const JS_DIR = join(REPO_ROOT, "vendor", "pvpoke", "src", "js");

// Load order matters only in that GameMaster must exist before the first
// getInstance() call; everything else is function/class declarations resolved
// at call time through the context's shared global scope.
const VENDOR_FILES = [
  "GameMaster.js",
  "pokemon/Pokemon.js",
  "battle/timeline/TimelineEvent.js",
  "battle/timeline/TimelineAction.js",
  "training/DecisionOption.js",
  "battle/actions/ActionLogic.js",
  "battle/DamageCalculator.js",
  "battle/Battle.js",
] as const;

export interface BuildSpec {
  speciesId: string;
  /** [fast, charged1, charged2?] — UPPER_SNAKE ids, e.g. a rankings `moveset`. */
  moveset: readonly string[];
  /**
   * Real IVs of an owned mon; the build is auto-levelled to the highest level
   * whose CP fits the league cap. Omit for meta opponents, which get PvPoke's
   * `defaultIVs` for the league — the same assumption the published rankings
   * make.
   */
  ivs?: { atk: number; def: number; hp: number };
  /**
   * The owned mon's current level. Power-ups only go upward, so a build whose
   * optimal level is below this floor is unobtainable → buildPokemon → null.
   */
  levelFloor?: number;
  /**
   * Build at exactly this level instead of auto-levelling to the cap — the
   * "use it as it stands" mode for zero-investment teams. Requires `ivs`.
   */
  exactLevel?: number;
}

export interface ShieldScenario {
  shields: readonly [number, number];
  /** Turns of energy advantage per side, Ranker-style. Default [0, 0]. */
  energyTurns?: readonly [number, number];
}

export interface DuelResult {
  /** Raw battle rating for each side, 0–1000; >500 is a win. */
  rating: number;
  opRating: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- vendor bridge is untyped */

function makeJqueryShim(pendingAjax: Array<() => void>): any {
  // The GameMaster success handler unconditionally does DOM-ish work
  // ($("<a…>").insertAfter($(sel).eq(2))); a callable, endlessly chainable
  // no-op absorbs all of it.
  const target: any = function () {};
  const chain: any = new Proxy(target, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => "" : chain),
    apply: () => chain,
  });
  const jq: any = () => chain;
  jq.ajax = (opts: any) => {
    if (!String(opts.url).includes("gamemaster")) {
      throw new Error(`Headless GameMaster shim: unexpected $.ajax to ${opts.url}`);
    }
    // Deferred like real ajax: the success handler calls methods GameMaster
    // only defines after issuing the request.
    pendingAjax.push(() =>
      opts.success(JSON.parse(readFileSync(GAMEMASTER_PATH, "utf8"))),
    );
  };
  jq.getJSON = (url: string) => {
    throw new Error(
      `Headless GameMaster shim does not serve $.getJSON (${url}) — set movesets ` +
        `explicitly instead of loading ranking data through GameMaster.`,
    );
  };
  jq.each = (obj: any, cb: any) => {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (cb.call(obj[i], i, obj[i]) === false) {
          break;
        }
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (cb.call(obj[key], key, obj[key]) === false) {
          break;
        }
      }
    }
  };
  return jq;
}

export class PvpokeSim {
  private readonly ctx: object;
  private readonly battle: any;
  private readonly PokemonCtor: any;
  readonly consoleErrors: string[] = [];
  simCount = 0;

  constructor() {
    const pendingAjax: Array<() => void> = [];
    const sandbox: Record<string, unknown> = {
      console: {
        log: () => {},
        error: (...args: unknown[]) => this.consoleErrors.push(args.join(" ")),
      },
      host: "localhost", // full (non-minified) gamemaster branch
      webRoot: "",
      siteVersion: "headless",
      settings: { gamemaster: "gamemaster", hardMovesetLinks: false },
      window: { localStorage: { getItem: () => null, setItem: () => {} } },
      $: makeJqueryShim(pendingAjax),
    };
    this.ctx = createContext(sandbox);
    for (const file of VENDOR_FILES) {
      runInContext(readFileSync(join(JS_DIR, file), "utf8"), this.ctx, {
        filename: `vendor/pvpoke/src/js/${file}`,
      });
    }
    const gm = runInContext("GameMaster.getInstance()", this.ctx);
    for (const flush of pendingAjax) {
      flush();
    }
    if (!Array.isArray(gm.data?.pokemon) || gm.data.pokemon.length === 0) {
      throw new Error(
        "GameMaster did not load pokemon data — the vendored loader's shape " +
          "has drifted from docs/reference/data-sources.md.",
      );
    }
    this.PokemonCtor = runInContext("Pokemon", this.ctx);
    this.battle = runInContext("new Battle()", this.ctx);
    this.battle.setCP(1500);
  }

  /**
   * Build a battle-ready Pokemon, or null when real IVs cannot legally fit
   * under the cap (optimal level below the mon's current level).
   */
  buildPokemon(spec: BuildSpec): any | null {
    const p = new this.PokemonCtor(spec.speciesId, 0, this.battle);
    if (!p || typeof p.speciesId !== "string") {
      throw new Error(`PvPoke does not know speciesId "${spec.speciesId}".`);
    }
    if (spec.exactLevel !== undefined) {
      if (!spec.ivs) {
        throw new Error(`exactLevel build for ${spec.speciesId} requires ivs.`);
      }
      p.setIV("atk", spec.ivs.atk);
      p.setIV("def", spec.ivs.def);
      p.setIV("hp", spec.ivs.hp);
      p.setLevel(spec.exactLevel, true);
    } else if (spec.ivs) {
      p.autoLevel = true; // each setIV re-derives the max level under the cap
      p.setIV("atk", spec.ivs.atk);
      p.setIV("def", spec.ivs.def);
      p.setIV("hp", spec.ivs.hp);
      if (spec.levelFloor !== undefined && p.level < spec.levelFloor) {
        return null;
      }
    } else {
      p.initialize(this.battle.getCP());
    }
    const [fast, charged1, charged2] = spec.moveset;
    if (!fast || !charged1) {
      throw new Error(`Moveset for ${spec.speciesId} needs a fast and a charged move.`);
    }
    p.selectMove("fast", fast, 0, true);
    p.selectMove("charged", charged1, 0, true);
    if (charged2) {
      p.selectMove("charged", charged2, 1, true);
    } else if (p.chargedMoves.length > 1) {
      // initialize() defaulted a second charged move; a 2-move ranked set
      // means exactly one.
      p.chargedMoves.length = 1;
    }
    if (
      p.fastMove?.moveId !== fast ||
      p.chargedMoves[0]?.moveId !== charged1 ||
      (charged2 !== undefined && p.chargedMoves[1]?.moveId !== charged2)
    ) {
      throw new Error(
        `Moveset [${spec.moveset.join(", ")}] did not stick on ${spec.speciesId} — ` +
          `check the move ids against gamemaster.json.`,
      );
    }
    return p;
  }

  /** Mirror of Ranker.js's per-battle drive (documented in data-sources.md). */
  duel(a: any, b: any, scenario: ShieldScenario): DuelResult {
    this.battle.setNewPokemon(a, 0, false);
    this.battle.setNewPokemon(b, 1, false);
    a.reset();
    b.reset();
    a.setShields(scenario.shields[0]);
    b.setShields(scenario.shields[1]);
    const [turnsA, turnsB] = scenario.energyTurns ?? [0, 0];
    // Ranker quirk kept intact (~line 313): both sides' fast-move counts are
    // derived from the *subject's* scenario turns and cooldown.
    const count = Math.max(1, Math.floor((turnsA * 500) / a.fastMove.cooldown));
    a.startEnergy = turnsA === 0 ? 0 : Math.min(a.fastMove.energyGain * count, 100);
    b.startEnergy = turnsB === 0 ? 0 : Math.min(b.fastMove.energyGain * count, 100);
    this.battle.simulate();
    this.simCount++;
    return { rating: a.getBattleRating(), opRating: b.getBattleRating() };
  }

  teamBuilderUrl(members: readonly any[]): string {
    const str = members.map((m) => m.generateURLPokeStr("team-builder")).join(",");
    return `https://pvpoke.com/team-builder/all/1500/${encodeURIComponent(str)}`;
  }
}
