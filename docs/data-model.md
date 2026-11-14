# The inspector's record

The record the inspector gives for a creature, schema 1: what each field means and which check proved
it. Mods receive it as a Lua table from [the API](api.md); tools outside the game receive it as JSON
in an `A7XDATA` line. Its one machine definition is the Zod schema in `src/model/schemas.ts`, also
published as JSON Schema in [data-model.schema.json](data-model.schema.json); why is in
[ADR-0006](adr/0006-data-model-and-api.md).

## Fields

Only fields a check has proven are in the record, so a value is never a guess
(`docs/rules/verify-derived-values.md`). Stats are the ones in effect now, items and spells included,
as the engine uses them. The checks are the [party check](manual-tests/walker.md), the
[creature list](manual-tests/creatures.md) and the [spawn check](manual-tests/spawn.md); where each
value sits in game memory is in [docs/re-notes.md](re-notes.md#engine-structures), which consumers
never need. Every field is required:

| Field | Type | Meaning | Proven by |
| --- | --- | --- | --- |
| `schema` | `1` | the record format's version | |
| `id` | integer | the engine's id for the creature, valid for this game session | party check |
| `resref` | string, up to 8 characters | the name of the `.cre` file the creature was made from | spawn check |
| `name` | string | the name the game shows for it | party check |
| `allegiance` | `{ ea, side }` | whose side the creature is on: `ea`, the engine's value from 0 to 255 (IESDP's `EA.IDS`: 2 a party member, 128 neutral, 255 enemy), and `side`, the same in words: `"party"` for a party member, otherwise `"ally"` for 30 or less, `"enemy"` for 200 or more, `"neutral"` between | party check, spawn check (`ea`); creature list (`side`) |
| `hp` | `{ cur, max }` | hit points now, and the maximum | party check, spawn check (`max`) |
| `ac` | integer | armor class | party check, spawn check |
| `ac_mods` | `{ crushing, missile, piercing, slashing }` | AC adjustments against each kind of attack | party check, spawn check |
| `thac0` | integer | THAC0, before the bonuses of the weapon in hand; the record screen shows it after them | spawn check |
| `saves` | `{ death, wand, poly, breath, spell }` | saving throws | party check, spawn check |
| `resist` | `{ fire, cold, electricity, acid, magic_fire, magic_cold, slashing, crushing, piercing, missile }` | resistances, in percent | spawn check |
| `mr` | integer | magic resistance, in percent | spawn check |

All numbers are integers. A record never has fields other than these; a consumer may still ignore
fields it does not know, to be ready for optional ones.

## Example

The record for an enemy, as an `A7XDATA` line carries it (keys sorted, here spread over lines). It
is the third line of `test/fixtures/a7xdata.txt`, which the Lua API writes for the tests' fake game:

```json
{
  "ac": 0,
  "ac_mods": {
    "crushing": 0,
    "missile": 0,
    "piercing": 0,
    "slashing": 0
  },
  "allegiance": {
    "ea": 255,
    "side": "enemy"
  },
  "hp": {
    "cur": 60,
    "max": 60
  },
  "id": 19662803,
  "mr": 0,
  "name": "Ogre",
  "resist": {
    "acid": 0,
    "cold": 0,
    "crushing": 0,
    "electricity": 0,
    "fire": 0,
    "magic_cold": 0,
    "magic_fire": 0,
    "missile": 0,
    "piercing": 0,
    "slashing": 0
  },
  "resref": "OGRE01",
  "saves": {
    "breath": 0,
    "death": 0,
    "poly": 0,
    "spell": 0,
    "wand": 0
  },
  "schema": 1,
  "thac0": 0
}
```

## Changes

- **Adding an optional field** keeps `schema = 1`. Phase 5 adds game time, the pause state and active
  spells this way.
- **Renaming, removing or changing the meaning of a field** raises `schema`, and changes the Zod
  schema, `deno task schema`'s generated file, this page and the Lua API together.
