# The inspector's API

How another game mod, or a tool outside the game, reads what the inspector reads: the public Lua
table `A7X` inside the game, and the `A7XDATA` JSON lines in the game's log outside it. Both carry the
same record, defined in [docs/data-model.md](data-model.md).
[ADR-0006](adr/0006-data-model-and-api.md) explains why it has this shape. This is API **1.1**,
records of **schema 1**.

## Inside the game: the `A7X` table

The inspector loads with `Infinity_DoFile("a7x")`. The WeiDU component (`deno task install-mod`) puts
that line in `ui.menu`, so the game loads it at startup; without the component, type it in the
Ctrl+Space console. It leaves one global, `A7X`. A consumer looks it up when it needs it, never at file
load, so the order mods load in does not matter:

```lua
if A7X and A7X.status() == "ok" then
  local enemies = A7X.list("enemies")
  for _, c in ipairs(enemies.creatures) do
    local r = A7X.get(c.id)
    if r then Infinity_DisplayString(r.name .. " " .. r.hp.cur .. "/" .. r.hp.max) end
  end
end
```

The functions, all of which return fresh tables and none of which raises:

| Function | Returns |
| --- | --- |
| `A7X.version()` | `{ api = "1.1", schema = 1, build = "2.7.3 arm64" }`; `build` is missing when the inspector is not running |
| `A7X.status()` | `"ok"`; `"no_native"` when the game started without the inspector's library, or the library refused this game build; `"loading"` when no game has loaded or no area is on screen |
| `A7X.get(id)` | the record for a creature id, or `nil` and a reason: the status, `"stale id"` for an id that no longer names a creature, `"unreadable: <field>"` when the inspector could not read a value |
| `A7X.list(filter)` | `{ area = "<resref>", creatures = { { id, name, allegiance = { ea, side } }, ... } }` for the area on screen; `filter` is `"all"` (the default), `"enemies"` or `"party"` |
| `A7X.hovered()` | the record of the creature under the pointer in the area on screen, or `nil` and a reason: the status, `"nothing under the pointer"`, `"not a creature"` for a door, container or region, `"stale id"`, or `"unreadable: <field>"` (since 1.1) |
| `A7X.portrait()` | the record of the party member whose portrait is under the pointer, or `nil` and a reason: the status, `"no portrait under the pointer"`, `"no party member in slot <n>"` (since 1.1) |
| `A7X.show(what)` | console output, not data: prints the records for an id, `"enemies"`, `"party"` or `"all"` to the message window, and writes each as an `A7XDATA` line; a list ends with a summary line (`[A7X] all in AR0602: 12 shown, 0 not readable`), a creature it cannot read appears by name with the reason, and every line it prints also goes to the game's log as plain text. With no argument, what the hotkey calls: the portrait under the pointer, else the creature under it; how to call it when the pointer is on neither, and the reason when it cannot read what is there |

Rules a consumer can rely on:

- **Check `api` before calling.** A different major version means the functions may have changed.
- **Ids last for the game session.** A saved id may name a different creature after loading a game.
- **The inspector caches nothing for you.** Each call reads game memory again; call from your own
  throttled tick, not every frame.
- **No raw reads.** The inspector's memory-reading table is private once the first API call has run;
  other mods get records, never addresses.
- **Loading again changes nothing.** When `ui.menu` or an earlier `Infinity_DoFile("a7x")` has
  already loaded `A7X`, a second load returns at once and the first API stays in place. A second
  API could not work: the first one took the library's table private.
- **Each call reads the pointer anew.** `hovered` and `portrait` answer for where the
  pointer is at that moment, so call them from a key press or a click, not from a timer.

## Outside the game: `A7XDATA` lines

`A7X.show` also writes each record it prints to the game's log as one line:

```text
A7XDATA	{"ac":5,"ac_mods":{"crushing":0,...},"allegiance":{"ea":128,"side":"neutral"},...}
```

After `A7XDATA` comes a tab, then the record as JSON with its keys sorted. `deno task play` captures the
log into `logs/`, and `deno task verify` checks every line against the schema. A tool that does not use
TypeScript can check the lines against [data-model.schema.json](data-model.schema.json), the same
schema as JSON Schema.

## Versions

- **The API** follows semantic versioning: adding a function is a minor version, changing or removing
  one a major.
- **The record** carries `schema`: adding an optional field keeps it, renaming, removing or changing
  the meaning of a field raises it.
