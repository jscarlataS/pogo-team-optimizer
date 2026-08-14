# Great League top 100 — in-game search strings

- Source: PvPoke `rankings/all/overall/rankings-1500.json` (vendored; gamemaster timestamp 2026-08-13 20:39:22)
- 100 ranking entries collapse to **73 base species** (shadows, regionals, and forms merged by dex number), listed in rank order so a truncated paste still keeps the most meta-relevant species
- Chunk budget: 200 characters

## Species names

**Chunk 1 of 4** — 22 species, ends with `Sableye` (check that one still matches after pasting):

```
Mimikyu,Lickilicky,Tinkaton,Altaria,Empoleon,Quagsire,Jellicent,Forretress,Ninetales,Feraligatr,Corsola,Jumpluff,Clodsire,Corviknight,Fearow,Azumarill,Kingdra,Guzzlord,Lapras,Furret,Dragonair,Sableye
```

**Chunk 2 of 4** — 22 species, ends with `Malamar` (check that one still matches after pasting):

```
Seismitoad,Umbreon,Medicham,Talonflame,Oinkologne,Sliggoo,Sealeo,Greedent,Diggersby,Dusclops,Grumpig,Cradily,Florges,Wigglytuff,Moltres,Blastoise,Clefable,Mantine,Mandibuzz,Dewgong,Gastrodon,Malamar
```

**Chunk 3 of 4** — 22 species, ends with `Shelgon` (check that one still matches after pasting):

```
Steelix,Drapion,Charjabug,Swampert,Aegislash,Bastiodon,Marowak,Stunfisk,Registeel,Dusknoir,Hydreigon,Dunsparce,Pelipper,Melmetal,Seaking,Turtonator,Dondozo,Gourgeist,Milotic,Morpeko,Oranguru,Shelgon
```

**Chunk 4 of 4** — 7 species, ends with `Toxapex` (check that one still matches after pasting):

```
Samurott,Doublade,Morgrem,Castform,Crustle,Spidops,Toxapex
```

## Dex numbers

**Chunk 1 of 2** — 52 species, ends with `618` (check that one still matches after pasting):

```
778,463,959,334,395,195,593,205,38,160,222,189,980,823,22,184,230,799,131,162,148,302,537,197,308,663,916,705,364,820,660,356,326,346,671,40,146,9,36,226,630,87,423,687,208,452,737,260,681,411,105,618
```

**Chunk 2 of 2** — 21 species, ends with `748` (check that one still matches after pasting):

```
379,477,635,206,279,809,119,776,977,711,350,877,765,372,503,680,860,351,558,918,748
```

## Full uncapped strings

For binary-searching the real character cap, if you want to pin it down:

```
Mimikyu,Lickilicky,Tinkaton,Altaria,Empoleon,Quagsire,Jellicent,Forretress,Ninetales,Feraligatr,Corsola,Jumpluff,Clodsire,Corviknight,Fearow,Azumarill,Kingdra,Guzzlord,Lapras,Furret,Dragonair,Sableye,Seismitoad,Umbreon,Medicham,Talonflame,Oinkologne,Sliggoo,Sealeo,Greedent,Diggersby,Dusclops,Grumpig,Cradily,Florges,Wigglytuff,Moltres,Blastoise,Clefable,Mantine,Mandibuzz,Dewgong,Gastrodon,Malamar,Steelix,Drapion,Charjabug,Swampert,Aegislash,Bastiodon,Marowak,Stunfisk,Registeel,Dusknoir,Hydreigon,Dunsparce,Pelipper,Melmetal,Seaking,Turtonator,Dondozo,Gourgeist,Milotic,Morpeko,Oranguru,Shelgon,Samurott,Doublade,Morgrem,Castform,Crustle,Spidops,Toxapex
```

```
778,463,959,334,395,195,593,205,38,160,222,189,980,823,22,184,230,799,131,162,148,302,537,197,308,663,916,705,364,820,660,356,326,346,671,40,146,9,36,226,630,87,423,687,208,452,737,260,681,411,105,618,379,477,635,206,279,809,119,776,977,711,350,877,765,372,503,680,860,351,558,918,748
```

## Manual in-game test checklist

Most of the original checklist is resolved (see `docs/reference/open-questions.md`):
commas are OR, the full un-chunked list pasted without truncation, and chunk
coverage was verified during the Great League scanning pass. Still open,
cosmetic only:

1. **Prefix/substring matching** — search `mew`. Note whether Mewtwo (and
   anything else) matches; this tells us how much noise name strings admit.

Tip while scanning: the game's search also filters by CP — appending a range
like `&cp1500-2500` should show only specimens in the Ultra band (standard
GO search syntax, untested by us; verify once before relying on it).
