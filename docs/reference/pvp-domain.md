# PvP domain reference

Background needed to write a scoring function that produces teams a competent player
would actually bring. Written for an agent with no Pokémon GO PvP context.

---

## Format

GO Battle League: 3 Pokémon per side. You lead with one; the other two are your
backline. Both players can switch, with a cooldown. Each player has 2 shields to spend
across the match, protecting against a single charged attack each.

The consequence that drives everything: **you do not get to choose your matchups
freely.** Your best answer to the opponent's lead may be stuck behind a switch
cooldown. This is the *alignment problem*, and it is why a team of three individually
top-ranked Pokémon can be a bad team.

---

## Roles

A functional team fills three roles. These map onto PvPoke's ranking categories.

**Lead.** Goes first. Faces the opponent's lead with both players at full shields.
Wants broad, safe matchups — it will face something unknown. PvPoke's *Leads*
category (simulated at 1v1 shields, not 2v2 — corrected 2026-08-14 against the
actual `rankingScenarios` data).

**Safe swap.** The pivot you bring in when the lead matchup is bad. Comes in at an
energy deficit and must survive and stabilise. Wants bulk and few hard losses rather
than spectacular wins. PvPoke's *Switches* category — note its simulation setup is
not the intuitive one: the ranked Pokémon gets a 4-turn energy *advantage*, and
"favour safe matchups" is implemented by up-weighting hard losses (see
`data-sources.md`). It still selects for the right property (few hard losses), but
describing it as "6 turns of energy deficit" was wrong.

**Closer.** Finishes the match, typically with shields depleted. Wants raw damage and
the ability to win from behind. PvPoke's *Closers* category (0v0 shields).

A team of three leads is a common novice mistake and scores well on naive per-matchup
averaging. Penalize it explicitly.

---

## Team shapes

**ABB** — one lead plus two similar backline pivots that cover overlapping threats.
**ABA** — alternating type/role structure.

**Duo cores** — the standard construction method is to find pairs that cover each
other's losing matchups, then add a third that covers what the pair misses. PvPoke's
own team-building guide formalises building multiple non-overlapping duo cores. This
is a useful heuristic for *explaining* a recommended team in the report, even though
the optimizer arrives at teams by brute force rather than by construction.

---

## What makes a team good

**Coverage.** Across the meta, how many common opponents does at least one team member
beat? Weighted by how often you actually face each opponent — beating a rare Pokémon
is worth less than beating a ubiquitous one.

**No shared weakness.** Three Pokémon all weak to the same type is fragile in a way
that per-matchup scoring underweights, because a single opponent type invalidates the
whole team rather than one third of it. Penalize explicitly.

**Shield pressure and bait dynamics.** Charged moves cost energy; cheap moves can be
thrown to bait out shields before a heavy hitter lands. A Pokémon whose performance
depends on the opponent guessing wrong is less reliable in practice than its rating
suggests — this is what PvPoke's *Consistency* category measures. Prefer consistency
where scores are close, especially for a returning player still rebuilding reflexes.

**Bulk.** Survivability translates into switch flexibility: a bulky Pokémon can absorb
a bad matchup while the switch clock runs down.

---

## Scoring notes

**Battle Rating** is PvPoke's per-matchup output: 0–1000, above 500 is a win. The
distance from 500 indicates decisiveness — a 505 is a coin flip in practice, a 800 is
a hard counter. Do not treat matchups as binary win/loss; the margin carries real
information and a scoring function that discards it will overrate teams that squeak
past everything.

**Shield scenario weighting.** 1-shield situations are the most common in real play.
Prior art weights 0/1/2 shields at 0.30/0.50/0.20.

**Geometric over arithmetic mean.** A geometric mean punishes being bad at any
single thing, which is the property team scoring wants: a team with no closer
should score badly rather than average out its failure against strengths
elsewhere. (Previously this was attributed to PvPoke's own aggregation; that was
wrong — PvPoke's overall formula actually weights a Pokémon's *best* categories
12:6:4:2 to favour specialists. The recommendation stands on its own merits.)

**Meta weighting matters more than it looks.** Uniform weighting over a meta list
quietly optimizes for beating Pokémon nobody brings. Get frequency data in as early as
practical.

---

## Honest limits of simulation

Worth encoding in the report output so results are read with appropriate scepticism.

Simulations assume optimal move timing and baiting and fixed shield scenarios. Real
matches add lag, misplays, shield guessing, energy leads carried between Pokémon, and
the alignment problem. A lower threat score is a starting point, not a promise of
ladder wins. The tool's honest claim is "these teams are structurally sound given what
you own," not "these teams will win."

Also: PvPoke ratings assume the *recommended* moveset. This tool must simulate the
moveset actually owned, which will sometimes rate a Pokémon well below its published
ranking. That divergence is a feature — it is the entire reason the tool exists — but
it will look like a bug the first time it appears. Surface it in the report.
