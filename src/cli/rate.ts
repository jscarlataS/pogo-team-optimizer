import { parseArgs } from "node:util";
import { loadGamemaster, loadRankings } from "../data/pvpoke.js";
import type { Gamemaster, League } from "../data/pvpoke.js";
import { parseLeague } from "./common.js";
import { defaultRosterPath, loadRoster } from "../roster.js";
import { expandRoster } from "../resolve.js";
import type { Candidate } from "../resolve.js";
import { PvpokeSim } from "../sim/harness.js";
import { selectReadyCandidates, selectViableCandidates } from "../viability.js";
import type { ViableCandidate } from "../viability.js";
import { computeMatrix, DEFAULT_MATRIX } from "../matrix.js";
import {
  buildProfiles,
  DEFAULT_SCORE_CONFIG,
  scoreTeam,
  searchTeams,
} from "../score.js";
import type { MemberProfile } from "../score.js";
import { renderTeamDetail } from "../report.js";

// Rate a hand-picked team (or profile individual mons) from the roster. Unlike
// `optimize`, this looks species up in the league's FULL rankings, so off-meta
// picks (anything outside the top-100 viability pool) can still be evaluated —
// that is the whole point: grading the team the user actually fields.

const USAGE = `Usage: npm run rate -- [options] <species> [<species> ...]

Score the named roster mons against the meta. With exactly three, also rate
them as a team with the same scoring function \`optimize\` uses — the number is
directly comparable to the tier reports. Species may be PvPoke ids or display
names; case and punctuation are ignored ("stunfisk_galarian", "Stunfisk
(Galarian)", "sandslash alolan" all work).

Options:
  --league <l>      great (default) or ultra — CP cap, rankings, and meta
  --roster <path>   Poke Genie CSV (default: newest .csv in data/)
  --build <mode>    "ready" = as scanned, exact level (default);
                    "optimal" = best legal build for the IVs (evolutions allowed)
  --meta <n>        opponent pool size (default ${DEFAULT_MATRIX.metaN})
  --pool-top <n>    with 3 species: also rank the team against every team the
                    roster can field from a pool of the top <n> ranking entries
  --help
`;

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function positiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--${name} must be a positive integer, got "${value}"`);
  }
  return n;
}

function displayName(speciesId: string, gm: Gamemaster): string {
  return gm.pokemonById.get(speciesId)?.speciesName ?? speciesId;
}

const prettyMove = (id: string): string =>
  id
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");

/** targetSpeciesIds (with their display names) that a user specifier matches. */
function matchIds(
  spec: string,
  candidates: readonly Candidate[],
  gm: Gamemaster,
): string[] {
  const norm = normalize(spec);
  const ids = new Set<string>();
  for (const c of candidates) {
    if (
      normalize(c.targetSpeciesId) === norm ||
      normalize(displayName(c.targetSpeciesId, gm)) === norm
    ) {
      ids.add(c.targetSpeciesId);
    }
  }
  return [...ids];
}

function memberCard(
  v: ViableCandidate,
  p: MemberProfile,
  meta: { ids: readonly string[]; weights: readonly number[] },
  gm: Gamemaster,
  league: League,
): string {
  const o = v.candidate.owned;
  const lines: string[] = [];
  lines.push(
    `## ${displayName(v.candidate.targetSpeciesId, gm)} — ${league.short} rank #${v.rank} ` +
      `(score ${v.ranking.score})`,
  );
  const moves = v.ranking.moveset.map(prettyMove);
  const pools = v.build as { eliteMoves?: string[]; legacyMoves?: string[] };
  const special = v.ranking.moveset.filter(
    (m) => pools.eliteMoves?.includes(m) || pools.legacyMoves?.includes(m),
  );
  lines.push(
    `- Specimen: ${o.name} CP${o.cp} L${o.level} ${o.ivs.atk}/${o.ivs.def}/${o.ivs.hp}` +
      ` → build L${v.build.level} CP${v.build.cp}` +
      (v.candidate.evolutionSteps > 0 ? ` (evolve ×${v.candidate.evolutionSteps})` : ""),
  );
  lines.push(
    `- Ranked moveset: ${moves[0]} + ${moves.slice(1).join(" / ")}` +
      (special.length > 0 ? ` (Elite TM: ${special.map(prettyMove).join(", ")})` : ""),
  );
  const s = v.ranking.scores;
  lines.push(
    `- PvPoke categories: leads ${s[0]} · closers ${s[1]} · switches ${s[2]} · ` +
      `consistency ${s[5]}`,
  );
  const rated = meta.ids.map((id, m) => ({
    id,
    rating: p.weightedRating[m]!,
    weight: meta.weights[m]!,
  }));
  const wins = rated.filter((r) => r.rating > 500);
  const weightedShare = wins.reduce((acc, r) => acc + r.weight, 0);
  lines.push(
    `- Beats ${wins.length}/${meta.ids.length} of the meta ` +
      `(${(weightedShare * 100).toFixed(0)}% by usage weight; shield-weighted rating > 500)`,
  );
  const byRating = [...rated].sort((a, b) => b.rating - a.rating);
  const fmt = (r: { id: string; rating: number }): string =>
    `${displayName(r.id, gm)} ${Math.round(r.rating)}`;
  lines.push(`- Best wins: ${byRating.slice(0, 4).map(fmt).join(", ")}`);
  lines.push(`- Worst losses: ${byRating.slice(-4).reverse().map(fmt).join(", ")}`);
  return lines.join("\n");
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      league: { type: "string", default: "great" },
      roster: { type: "string" },
      build: { type: "string", default: "ready" },
      meta: { type: "string", default: String(DEFAULT_MATRIX.metaN) },
      "pool-top": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(USAGE);
    return;
  }
  if (values.build !== "ready" && values.build !== "optimal") {
    throw new Error(`--build must be "ready" or "optimal", got "${values.build}"`);
  }
  const buildMode = values.build;
  const league = parseLeague(values.league);
  const metaN = positiveInt("meta", values.meta);
  const log = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };

  let rosterPath = values.roster;
  if (rosterPath === undefined) {
    const picked = defaultRosterPath();
    rosterPath = picked.path;
    log(picked.note);
  }
  const roster = loadRoster(rosterPath);
  const gm = loadGamemaster();
  const rankings = loadRankings(league);
  const sim = new PvpokeSim(league.cap);
  const allCandidates = expandRoster(roster, gm);
  const candidates =
    buildMode === "ready"
      ? allCandidates.filter((c) => c.evolutionSteps === 0)
      : allCandidates;

  // Resolve each specifier to exactly one target speciesId the roster can field.
  const requestedIds: string[] = [];
  for (const spec of positionals) {
    const ids = matchIds(spec, candidates, gm);
    if (ids.length === 0) {
      const norm = normalize(spec);
      const near = [
        ...new Set(
          candidates
            .map((c) => c.targetSpeciesId)
            .filter((id) => normalize(id).includes(norm)),
        ),
      ];
      throw new Error(
        `"${spec}" does not match any ${buildMode}-mode roster candidate.` +
          (near.length > 0 ? ` Close: ${near.join(", ")}.` : "") +
          (buildMode === "ready"
            ? " (ready mode only considers mons in their scanned form — no evolutions.)"
            : ""),
      );
    }
    if (ids.length > 1) {
      throw new Error(`"${spec}" is ambiguous: ${ids.join(", ")} — use a speciesId.`);
    }
    if (requestedIds.includes(ids[0]!)) {
      throw new Error(`"${spec}" repeats ${ids[0]} — a team cannot field a species twice.`);
    }
    requestedIds.push(ids[0]!);
  }

  // Full-rankings selection restricted to the requested species: keeps the
  // tested build/CP-assert/dedupe paths, without the top-100 meta cutoff.
  const select = buildMode === "ready" ? selectReadyCandidates : selectViableCandidates;
  const matched = candidates.filter((c) => requestedIds.includes(c.targetSpeciesId));
  const selection = select(matched, rankings, sim, { topN: rankings.length });
  const viableList: ViableCandidate[] = requestedIds.map((id) => {
    const v = selection.viable.find((x) => x.candidate.targetSpeciesId === id);
    if (v === undefined) {
      const over = selection.infeasible.find((c) => c.targetSpeciesId === id);
      throw new Error(
        over !== undefined
          ? `${id}: no legal ${league.short} build — ${over.owned.name} ` +
            `CP${over.owned.cp} is over the ${league.cap} cap.`
          : `${id}: not in the ${league.short} rankings at all — cannot rate it.`,
      );
    }
    return v;
  });

  const config = DEFAULT_SCORE_CONFIG;
  const matrix = computeMatrix(viableList, rankings, sim, gm.timestamp, { metaN }, log);
  const { members, meta } = buildProfiles(viableList, matrix, rankings, config);

  const out: string[] = [];
  viableList.forEach((v, i) => {
    out.push(memberCard(v, members[i]!, meta, gm, league));
    out.push("");
  });

  if (members.length === 3) {
    const team = scoreTeam(
      [members[0]!, members[1]!, members[2]!],
      meta,
      config,
    );
    const names = requestedIds.map((id) => displayName(id, gm));
    out.push(`# Team ${names.join(" + ")} — ${team.total.toFixed(1)}`);
    out.push("");
    out.push(renderTeamDetail(team, viableList, buildMode, { gm, config, sim, league }));
    out.push("");

    if (values["pool-top"] !== undefined) {
      const poolTop = positiveInt("pool-top", values["pool-top"]);
      const pool = select(allCandidates, rankings, sim, { topN: poolTop });
      const poolViable = [...pool.viable];
      for (const v of viableList) {
        if (
          !poolViable.some(
            (p) => p.candidate.targetSpeciesId === v.candidate.targetSpeciesId,
          )
        ) {
          poolViable.push(v); // rated species outside the pool cutoff still competes
        }
      }
      const poolMatrix = computeMatrix(
        poolViable,
        rankings,
        sim,
        gm.timestamp,
        { metaN },
        log,
      );
      const poolProfiles = buildProfiles(poolViable, poolMatrix, rankings, config);
      const search = searchTeams(
        poolProfiles.members,
        poolProfiles.meta,
        config,
        Number.MAX_SAFE_INTEGER,
      );
      const want = new Set(requestedIds);
      const idx = search.top.findIndex(
        (t) => t.speciesIds.every((id) => want.has(id)),
      );
      const best = search.top[0]!;
      out.push(
        `Within your roster's ${buildMode} pool (top-${poolTop} rankings, ` +
          `${poolViable.length} mons): this team ranks ` +
          `**#${idx + 1} of ${search.teamsScored}** teams. Pool best: ` +
          `${best.speciesIds.map((id) => displayName(id, gm)).join(" + ")} — ` +
          `${best.total.toFixed(1)}.`,
      );
      out.push("");
    }
  }

  process.stdout.write(out.join("\n"));
}

main();
