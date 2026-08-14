---
name: implement
description: Implement the agreed plan for the current milestone of the Pokémon GO team optimizer, with verify-before-you-write discipline. Invoke explicitly after a plan has been confirmed.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
disable-model-invocation: true
---

Implement the plan we agreed on.

$ARGUMENTS

## Non-negotiable while implementing

**Verify before you write.** If you are about to reference a JSON key, a CSV column,
or an API shape that you have not seen in an actual file in this session, stop and
open the file. `docs/reference/open-questions.md` lists what is known to be
unverified. A guessed field name that happens to parse is worse than a crash, because
it fails silently three layers later.

**Never touch Niantic.** No requests to Pokémon GO services, no game client
interaction. Ingestion is a user-exported CSV and static PvPoke data. Nothing else.
See `CLAUDE.md`.

**Do not reimplement the battle simulator.** Vendor PvPoke's and drive it. If it
proves impractical to run headlessly, stop and tell me — that is an architectural
fork I want to decide, not have decided for me.

**Fail loudly on unresolved species.** Silently dropping a Pokémon from the roster
means silently dropping a possibly-optimal team.

## As you go

- When you resolve something from `open-questions.md`, update that file in the same
  session. Move it from open to answered, with what you actually observed.
- When reality contradicts `docs/architecture.md` or `docs/reference/data-sources.md`,
  correct the doc. The docs were written partly from inference; they are not sacred.
- Keep scoring weights in one config object, not scattered through the code.

## Stop and check in if

- The plan turns out to be wrong once you see the real data
- A step would require pulling work forward from a later milestone
- You find yourself about to guess at something the docs flagged as unverified

Finish by summarising what changed and what is now known that wasn't before.
