# Ultra League top 100 — in-game search strings

- Source: PvPoke `rankings/all/overall/rankings-2500.json` (vendored; gamemaster timestamp 2026-08-13 20:39:22)
- 100 ranking entries collapse to **70 base species** (shadows, regionals, and forms merged by dex number), listed in rank order so a truncated paste still keeps the most meta-relevant species
- Chunk budget: 200 characters

## ⚠ Warnings

- "Kommo-o" (dex 784) contains characters beyond A-Z; verify it works in the in-game search bar or add a BASE_NAME_OVERRIDES entry.

## Species names

**Chunk 1 of 4** — 21 species, ends with `Walrein` (check that one still matches after pasting):

```
Mimikyu,Lickilicky,Corviknight,Tinkaton,Florges,Empoleon,Virizion,Moltres,Jellicent,Forretress,Zygarde,Feraligatr,Ninetales,Kingdra,Registeel,Dusknoir,Lapras,Blastoise,Talonflame,Malamar,Walrein
```

**Chunk 2 of 4** — 21 species, ends with `Toucannon` (check that one still matches after pasting):

```
Dondozo,Regidrago,Giratina,Bellibolt,Annihilape,Cresselia,Milotic,Steelix,Cradily,Seaking,Swampert,Oranguru,Runerigus,Ampharos,Clefable,Turtonator,Raikou,Togekiss,Hippowdon,Orthworm,Toucannon
```

**Chunk 3 of 4** — 21 species, ends with `Oinkologne` (check that one still matches after pasting):

```
Aromatisse,Golisopod,Gyarados,Hydreigon,Seismitoad,Melmetal,Primarina,Cobalion,Guzzlord,Samurott,Tentacruel,Sylveon,Dudunsparce,Aurorus,Dragalge,Sandslash,Stunfisk,Scizor,Weezing,Goodra,Oinkologne
```

**Chunk 4 of 4** — 7 species, ends with `Drapion` (check that one still matches after pasting):

```
Gastrodon,Kommo-o,Ludicolo,Skeledirge,Cofagrigus,Crustle,Drapion
```

## Dex numbers

**Chunk 1 of 2** — 51 species, ends with `799` (check that one still matches after pasting):

```
778,463,823,959,671,395,640,146,593,205,718,160,38,230,379,477,131,9,663,687,365,977,895,487,939,979,488,350,208,346,119,260,765,867,181,36,776,243,468,450,968,733,683,768,130,635,537,809,730,638,799
```

**Chunk 2 of 2** — 19 species, ends with `452` (check that one still matches after pasting):

```
503,73,700,982,699,691,28,618,212,110,706,916,423,784,272,911,563,558,452
```

## New species only — nothing scanned yet (vs `data/poke_genie_export_updated.csv`)

54 of the 70 species above have no specimen in the export. Scanning passes are additive — never wipe Poke Genie, just scan and re-export. Note the match is by dex number: a species listed as scanned may still hide unscanned specimens worth scanning (other regional forms, or newly caught higher-CP ones).

### Names

**Chunk 1 of 3** — 21 species, ends with `Steelix` (check that one still matches after pasting):

```
Mimikyu,Lickilicky,Corviknight,Tinkaton,Florges,Empoleon,Virizion,Jellicent,Forretress,Zygarde,Feraligatr,Kingdra,Malamar,Walrein,Dondozo,Regidrago,Giratina,Bellibolt,Annihilape,Cresselia,Steelix
```

**Chunk 2 of 3** — 20 species, ends with `Sylveon` (check that one still matches after pasting):

```
Cradily,Oranguru,Runerigus,Ampharos,Turtonator,Raikou,Togekiss,Hippowdon,Orthworm,Toucannon,Aromatisse,Golisopod,Gyarados,Hydreigon,Seismitoad,Primarina,Cobalion,Samurott,Tentacruel,Sylveon
```

**Chunk 3 of 3** — 13 species, ends with `Drapion` (check that one still matches after pasting):

```
Dudunsparce,Aurorus,Dragalge,Scizor,Weezing,Goodra,Oinkologne,Gastrodon,Kommo-o,Ludicolo,Skeledirge,Cofagrigus,Drapion
```

### Dex numbers

**Chunk 1 of 2** — 50 species, ends with `784` (check that one still matches after pasting):

```
778,463,823,959,671,395,640,593,205,718,160,230,687,365,977,895,487,939,979,488,208,346,765,867,181,776,243,468,450,968,733,683,768,130,635,537,730,638,503,73,700,982,699,691,212,110,706,916,423,784
```

**Chunk 2 of 2** — 4 species, ends with `452` (check that one still matches after pasting):

```
272,911,563,452
```

## Full uncapped strings

For binary-searching the real character cap, if you want to pin it down:

```
Mimikyu,Lickilicky,Corviknight,Tinkaton,Florges,Empoleon,Virizion,Moltres,Jellicent,Forretress,Zygarde,Feraligatr,Ninetales,Kingdra,Registeel,Dusknoir,Lapras,Blastoise,Talonflame,Malamar,Walrein,Dondozo,Regidrago,Giratina,Bellibolt,Annihilape,Cresselia,Milotic,Steelix,Cradily,Seaking,Swampert,Oranguru,Runerigus,Ampharos,Clefable,Turtonator,Raikou,Togekiss,Hippowdon,Orthworm,Toucannon,Aromatisse,Golisopod,Gyarados,Hydreigon,Seismitoad,Melmetal,Primarina,Cobalion,Guzzlord,Samurott,Tentacruel,Sylveon,Dudunsparce,Aurorus,Dragalge,Sandslash,Stunfisk,Scizor,Weezing,Goodra,Oinkologne,Gastrodon,Kommo-o,Ludicolo,Skeledirge,Cofagrigus,Crustle,Drapion
```

```
778,463,823,959,671,395,640,146,593,205,718,160,38,230,379,477,131,9,663,687,365,977,895,487,939,979,488,350,208,346,119,260,765,867,181,36,776,243,468,450,968,733,683,768,130,635,537,809,730,638,799,503,73,700,982,699,691,28,618,212,110,706,916,423,784,272,911,563,558,452
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
