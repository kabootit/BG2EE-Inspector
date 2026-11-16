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
never need. The fields, each with the checks that proved it:

| Field | Type | Meaning | Proven by |
| --- | --- | --- | --- |
| `schema` | `1` | the record format's version | |
| `id` | integer | the engine's id for the creature, valid for this game session | party check |
| `resref` | string, up to 8 characters | the name of the `.cre` file the game made the creature from | spawn check |
| `name` | string | the name the game shows for it | party check |
| `allegiance` | `{ ea, side }` | whose side the creature is on: `ea`, the engine's value from 0 to 255 (IESDP's `EA.IDS`: 2 a party member, 128 neutral, 255 enemy), and `side`, the same in words: `"party"` for a party member, otherwise `"ally"` for 30 or less, `"enemy"` for 200 or more, `"neutral"` between | party check, spawn check (`ea`); creature list (`side`) |
| `hp` | `{ cur, max }` | hit points now, and the maximum | party check, spawn check (`max`) |
| `ac` | integer | armor class | party check, spawn check |
| `ac_mods` | `{ crushing, missile, piercing, slashing }` | AC adjustments against each kind of attack | party check, spawn check |
| `thac0` | integer | THAC0, before the bonuses of the weapon in hand; the record screen shows it after them | spawn check |
| `saves` | `{ death, wand, poly, breath, spell }` | saving throws | party check, spawn check |
| `resist` | `{ fire, cold, electricity, acid, magic_fire, magic_cold, slashing, crushing, piercing, missile }` | resistances, in percent | spawn check |
| `mr` | integer | magic resistance, in percent | spawn check |
| `effects` | list of `{ resref, name, seconds }`, optional | the spells active on the creature, soonest to expire first: `resref`, the spell or item that applied them; `name`, the name the game shows for it, a helper spell's parent's (`SPCL920A` shows Enhanced Bard Song), or the resref when the game gives none; `seconds`, game seconds until its last effect expires, rounded up. An empty list when nothing is active; missing when the inspector could not read the effects. Permanent effects and those of items worn have no countdown, and the list leaves them out | [Effect presence](manual-tests/effects.md), [Effect duration](manual-tests/durations.md), [Spell countdown](manual-tests/countdown.md) |

All numbers are integers. Every record carries every field above except `effects`, an optional field
added in Phase 5. A record never has fields other than these; a consumer may still ignore fields it
does not know, to be ready for later optional ones.

**Game seconds, not real ones.** A spell's duration counts game time, as its description gives it:
the countdown stands still while the player has the game paused, and the game's speed setting
changes how long it takes in real time. `name` comes from the names table `deno task install-mod` writes from the
game's files; a spell from a mod installed after the inspector shows its resref until the next
install, and without the WeiDU component every spell shows its resref.

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
  "effects": [],
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

- **Adding an optional field** keeps `schema = 1`. Phase 5 added the active spells, `effects`, this
  way.
- **Renaming, removing or changing the meaning of a field** raises `schema`, and changes the Zod
  schema, `deno task schema`'s generated file, this page and the Lua API together.
