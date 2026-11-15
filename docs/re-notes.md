# Reverse-engineering notes

Every engine address the native library uses: where it is in the 2.7.3 arm64 build, how it was found,
how it was checked, and how to find it again after a game update. The values themselves live in
`native/builds.h`; this page is the evidence behind them. Why the library calls engine code at all is
in [ADR-0005](adr/0005-dyld-interposing-hook.md).

## The build

The one build this page describes. All offsets below are image-relative (add the address of the game's
Mach-O header at run time) and belong to this build only.

| Field | Value |
| --- | --- |
| Version | BG2:EE 2.7.3, Steam, arm64 slice |
| `LC_UUID` | `54799B31-C2BF-36E9-9685-65F8EC3CA58F` |
| `__TEXT` | `vmaddr 0x100000000`, `fileoff 0`, so an offset in `__TEXT` is also a file offset in the slice |

The game is stripped: apart from Steam and libjingle, no symbol names. Lua 5.2 is linked in statically,
and the binary does not record its patch level; 5.2.4, the last 5.2 release, is the reference.

## How each site is checked

Each function in `builds.h` is a site: offset, size, and the FNV-1a 64-bit hash of its bytes. A global
cannot be hashed (it is data), so it gets an anchor: a short code site whose `ADRP`/`ADD` instructions
encode the global's address. Those instructions are PC-relative, so the anchor's bytes change if the
global or the code moves.

Two checks use the same table:

- **At load**, the library's constructor hashes every site in the mapped image. One mismatch disables
  it: nothing is read, nothing is called.
- **In `deno task test`**, `test/re/builds_test.ts` hashes the same ranges of the installed binary, with
  an implementation written separately in TypeScript, and fails naming the site and the hash it found.

## Lua API functions

The game's `lapi.c` is compiled in source order, but the linker removed the functions nothing calls
(`lua_rawgetp` among them), so counting function starts from a known function goes
wrong. Function sizes do line up: most of the game's `lapi.c` functions have exactly the size of the
same function in stock 5.2.4 built with `clang -arch arm64 -O2`. Each candidate was then compared
instruction by instruction with that reference build.

The functions the library calls, in the order of `enum a7x_fn`:

| Function | Offset | Size | How it was confirmed |
| --- | --- | --- | --- |
| `lua_checkstack` | `0x5499cc` | `0xd8` | Same instructions as the reference apart from register choice; reads `top` at 0x10, `ci` at 0x20, `stack_last` at 0x30 and `stack` at 0x38, the stock layout |
| `lua_settop` | `0x549b80` | `0xb8` | 46 instructions, as in the reference; only relocated loads differ. `Infinity_Log` calls it with -2 after `lua_pcallk`, which is `lua_pop(L, 1)` |
| `lua_tointegerx` | `0x54a9a8` | `0xf0` | 60 instructions, as in the reference; only relocated loads differ |
| `lua_tolstring` | `0x54ac54` | `0x1bc` | `Infinity_Log`'s C function (`0x337684`) calls it as `(L, 1, NULL)` and prints the result |
| `lua_pushinteger` | `0x54b334` | `0x24` | Identical to the reference |
| `lua_pushlstring` | `0x54b37c` | `0x78` | 30 instructions, as in the reference; only their order differs |
| `lua_pushcclosure` | `0x54b520` | `0x1a0` | The `Infinity_*` registration function calls it 147 times before `lua_setglobal`; with no upvalues it stores tag `0x16` (`LUA_TLCF`) at `L->top` (ADR-0005) |
| `lua_createtable` | `0x54bb10` | `0x98` | Identical to the reference |
| `lua_setglobal` | `0x54bd88` | `0x88` | Identical to the reference; called 146 times by the registration function (ADR-0005) |
| `lua_setfield` | `0x54bee0` | `0x104` | 65 instructions, as in the reference; only relocated loads differ |
| `lua_pcallk` | `0x54c568` | `0x1c8` | The reference's logic with its blocks reordered; `Infinity_Log` calls it as `(L, 1, 0, 0, 0, NULL)` |

`lua_pushnumber` (`0x54b314`) is identical to the reference too, although the library does not call it:
it stores the value from `d0`, so `lua_Number` is `double` and an address below 2^53 survives a round
trip through Lua exactly.

**`Infinity_Log` keeps at most 4084 characters of a message** and cuts the rest, with no sign of the
cut. Measured in the session logs: every party-check sprite dump, in all three Phase 3 runs that wrote
one and in the run of 2026-11-14, ends at exactly 4084 characters after `LUA: `. The inspector's lines stay
under 4000 (`A7XJSON.MAX_LINE` in `mod/inspector/lib/a7xjson.lua`), and the dump is written in
512-byte lines.

**The message window's color markup is `^0x`, eight hex digits as `0xAABBGGRR`, the text, then
`^-`**: alpha, then blue, green and red. The format string `^%#010x%s^-` in the binary gives the
shape, as BG2EE-GameLog found; the order of the bytes was settled by the Data API manual test of
2026-11-14, in which colors written as `0xAARRGGBB` showed with red and blue swapped (light blue as
gold, red as blue).

## Globals

The globals and the code that anchors each:

| Global | Offset | Anchor | How it was found |
| --- | --- | --- | --- |
| The engine's `lua_State*` | `0x35d7478` | `0x335440`, `0x20` bytes: the start of the `Infinity_*` registration function, whose `adrp x21`/`add #0x478` at `+0x10` load it | Every registration in that function passes `[x21]` as `L` (ADR-0005) |
| `g_pBaldurChitin` | `0x35d70d0` | `0x2140c`, `0x2c` bytes: the whole tolua getter | The string `"g_pBaldurChitin"` (`0x63dbad`) is passed to a tolua variable binding at `0x18e34` with getter `0x2140c`; the getter loads `[0x1035d70d0]` and pushes it as a `"CBaldurChitin"` userdata. This is the object behind the game's Lua global `e` |

| The object array | `0x35d8360` | `0x1ae26c`, `0x74` bytes: the whole lookup function, whose `adrp` loads encode the array and its bounds at `0x35d8352` and `0x35d8354` | The lookup `Infinity_UpdateLuaStats` calls with a party member's id (`deno task re annotate 0x3391e0`); its layout is under [Engine structures](#engine-structures) |

All three are in `__DATA,__common`, so they read as zero until the engine sets them; the hook gate
saw the `lua_State*` set by the first `glClear`. The object array is a table used in place, not a
pointer: `Objects()` returns its address without reading anything.

## Lua state layout

The idle check reads `L->ci` and compares it with `&L->base_ci`. The offsets are stock Lua 5.2.4 on
arm64, measured with `offsetof` on the vendored source:

| Field | Offset | Confirmed in the game by |
| --- | --- | --- |
| `top` | 0x10 | `lua_pushcclosure`, `lua_checkstack` |
| `l_G` | 0x18 | `lua_setglobal` |
| `ci` | 0x20 | `lua_checkstack` |
| `stack_last` | 0x30 | `lua_checkstack` |
| `stack` | 0x38 | `lua_checkstack` |
| `base_ci` | 0x80 | indirectly: at the hook gate, `ci` equalled `L + 0x80` at all 28,800 calls; a wrong offset would almost never match |

## Redoing this after a game update

A new build gets a new `LC_UUID`, so the library disables itself until `builds.h` has an entry for it.
`deno task re` reads the installed game's arm64 slice and does each step below; addresses can be given
image-relative (`0x5499cc`) or absolute (`0x1005499cc`), and output is image-relative, as in
`builds.h`. Its subcommands, in the order the steps use them (written once, in `src/re/commands.ts`;
`deno task test` fails when this table differs from it):

| Command | Prints |
| --- | --- |
| `deno task re starts [from] [to]` | function starts, from the slice's `LC_FUNCTION_STARTS` |
| `deno task re xrefs <string>` | where the string sits in `__cstring`, and every `adrp` that loads its address |
| `deno task re annotate <start> [end]` | the disassembly to the next function start, with each loaded string and each call to a `builds.h` function named |
| `deno task re compare <symbol> <start> [end]` | the game function against the same symbol in stock `lapi.c` built at `-O2`: instruction counts and differing lines |
| `deno task re stats <getter>` | a `GetAtOffset`-style getter's table: each stat id with its offset, width and signedness |
| `deno task re hash <start> [size]` | a `builds.h` site line: offset, size (by default to the next function start) and FNV-1a hash |
| `deno task re area-fields` | the object fields the engine compares with the area on screen, most compared first, each with the addresses of its comparisons |
| `deno task re id-fields` | the area fields the engine compares with an object's own id, read through the object's area, in the same form |

`compare` needs the Lua source (`deno task setup-dev`). The steps:

1. **Find `Infinity_Log`'s registration.** `deno task re xrefs Infinity_Log` gives the `adrp` that
   loads the name, inside the registration function. `annotate` that function: before the name it
   loads the C function's address and calls `lua_pushcclosure`; after it, `lua_setglobal`; and every
   call passes `[x21]`, loaded from the `lua_State*` global. `annotate` the C function for
   `lua_tolstring`, `lua_pcallk` and `lua_settop`.
2. **Place the rest by size.** List the starts around those functions with `starts`, walk them in
   `lapi.c` order, and match each gap against the reference's symbol sizes (`nm -n` on
   `build/re/lapi.o`, which `compare` builds). Confirm each candidate with `compare`: relocated loads
   (`ldr` from the GOT in the object file, `add` in the linked game) and instruction order may differ;
   anything else is a reason to look closer. Functions nothing calls are missing from the game, so a
   gap that matches no size is one of those.
3. **Find `g_pBaldurChitin`** with `xrefs g_pBaldurChitin`: the tolua binding passes the name next to
   the getter's address, and `annotate` on the getter shows the global it loads.
4. **Write the entry** in `native/builds.h`, one `hash` line per site, then run `deno task test`: the
   builds test re-hashes every site in the installed binary and names any that differ. Then the
   in-game manual tests for the bridge decide whether the entry is right.
5. **Re-check the structure fields** found by tally: `area-fields` and `id-fields` should still put
   the offsets in [Engine structures](#engine-structures) first. `deno task test` fails when their
   counts change (`test/re/fields_test.ts`); the walker's offsets in `mod/inspector/lib/a7xoff.lua`
   follow whatever they print.

## Engine structures

The structures the walker follows. Most were found in the engine function that fills `characters[id]` for
the record screen (`0x2e24c8`, about 32 KB, called by `Infinity_UpdateLuaStats` at `0x3391e0` with
the selected party member's sprite) or in code it calls. That function reads exactly the fields an
inspector needs, so its loads give the arm64 offsets directly; `deno task re annotate 0x2e24c8` shows
each `characters` key next to the load that feeds it. The areas were found from the console's
`ExploreArea` and the engine code that compares an object's area with the one on screen. Offsets are
sprite-relative unless stated:

| What | Where | Evidence |
| --- | --- | --- |
| `CInfGame*` | `g_pBaldurChitin + 0x10c0` | loaded by `Infinity_UpdateLuaStats` and by the stats function |
| Party ids, count | game `+0x6618` (6 `int32`), game `+0x6630` (`int16`) | `Infinity_UpdateLuaStats` indexes the ids by slot after checking the count |
| Areas, and the one on screen | game `+0x6598`: 12 `CGameArea*`, 8 bytes each; the area on screen is entry `u8` game `+0x6590` | `CLUAConsole::ExploreArea` (`0x130de4`, bound at `0x1bf50`) reads `areas[game[+0x6590]]`; a function at `0x243ec0` compares a pointer with each of the 12 in turn. In the creature list's runs (2026-11-13) the index was 0, then 1 after an area change, and the party was in the indexed area both times |
| An area's resref | 8 bytes, NUL-padded, at `CGameArea +0x204` | `ExploreArea` copies it into its result string (`0x369558`); the creature list's runs read `AR4000` and then `AR4500`, the area the party had walked into |
| The object under the pointer | `int32` object id at `CGameArea +0x244`; below 0 when the pointer is on no object | `deno task re id-fields`: 24 engine sites compare an object's id with its own area's `+0x244`, among them `0xbeba4`, in code that draws a highlight; `0x904ac` writes it; `+0x248`, a related id, at 11. The Under the pointer test (2026-11-14) read the creature, the party member and the door or container the pointer rested on, and an id below 0 over empty ground |
| Object array slots | 16 bytes each from `0x35d8360`: `u16` generation at `+0`, pointer at `+8`; an empty slot has generation `0xffff` | the lookup `0x1ae26c`: an id's high 16 bits (masked to 15) are the slot, its low 16 bits the generation, which must match |
| Object array bounds | `int16` at `0x35d8350` (capacity), `0x35d8352` (highest slot in use), `0x35d8354` (next generation, from 2000) | the lookup, and the functions that add (`0x1ae3xx`) and clear (`0x1aeb1x`) objects |
| Object type | `u8` at `+0x8`; a sprite is `0x31` | ten engine sites compare it with `0x31` |
| Object id | `int32` at `+0x48` | `Infinity_UpdateLuaStats` sets the Lua global `id` from it; `characters` is keyed by it |
| Object area | `CGameArea*` at object `+0x18` | `deno task re area-fields`: 14 engine sites compare it with the area on screen, among them `0x86824` and `0xc3254`; no other field more than 2. In the creature list's runs every party member's matched it, in both areas, and creatures seen on screen were listed by it |
| EA | `u8` at `+0x38`: the EA byte of the `CAIObjectType` at `+0x30` | the party check's sprite dumps (2026-11-13): the only offset in the first 2 KB of all six party sprites that reads 2, the EA of a PC. Read statically from the type-matching code at `0x3f2xx`, the candidates were `+0x30` and `+0x78`, and the `.cre` header's EA at `+0x7c8` was a third; in the game they read other values for the party, and the header byte read 224 for every member |
| Stats blocks | `m_derivedStats` at `+0x1120`, `m_tempStats` at `+0x1dc0` (`0xca0` bytes each); `int32` at `+0x4e8c` (`m_bAllowEffectListCall`) non-zero means derived is current | the THAC0 code picks between them on that flag, the rule EEex follows |
| Each stat by `STATS.IDS` number | `CDerivedStats::GetAtOffset`, `0x7cd50`: ids 1 to 33 are `int16` at `2 * (id + 1)`, so `MAXHITPOINTS` `+0x4`, `ARMORCLASS` `+0x6`, the AC mods `+0x8` to `+0xe`, `THAC0` `+0x10`, saves `+0x14` to `+0x1c`, resistances `+0x1e` to `+0x32` (names as in IESDP's BG:EE `STATS.IDS`); id 151, `HITBONUS`, is `int16` at `+0x1f4` | `deno task re stats 0x7cd50` decodes all 202 from the getter's jump table |
| `.cre` resref | 8 bytes, NUL-padded, at `+0x540`: the file the creature was made from | `0x2d7e88`, called by `CLUAConsole::CreateCreature` with the resref right after construction, stores it there; the spawn check (2026-11-13) found every spawned creature by it, in two sessions |
| Base header | the creature's `.cre` header from file offset 0 at `+0x558`: name strref `+0x560` (file `0x08`), current HP `int16` `+0x57c` (file `0x24`), base saves `u8` `+0x5ac` (file `0x54`) | `characters[id].HP.current` and the save texts read these. The spawn check compared the engine's copy with the file for eight spawned creatures, straight after spawning: 37 to 66 of the header's `0x2d4` bytes differ. The first 8 (the signature) hold `ff ff ff ff ff ff ff 7f`; from `0x270` (the file's EA and other IDS bytes) on, most of the rest differ, so the engine uses that part otherwise: its `0x270` read 224, as the party check found at sprite `+0x7c8`. Between, only the colors at `0x2c` to `0x32` differ, in three of the eight |
| THAC0 as shown | `derived[+0x10] - int32[+0x1204] - selected[stat 151, HITBONUS]`, or `0` when the weapon slot (`u8` `+0x10f8`, item pointers from `+0xfc0`) is empty | `characters[id].THAC0.current` |
| Name | strref `+0x560`, through `Infinity_FetchString`; when it is `-1`, the engine string at `+0x3910` (a `char*`) | the name branch and `0x2b0434` |
| Saves in `characters[]` | text only, in `characters[id].proficiencies.savingThrows`: one line per save, death to spell, such as `Paralysis / Poison / Death: -4 (-7)`: the save as shown, then in brackets, only when it is not 0, how far that is from the base save. The code that builds it makes the shown save 4 better under `STATE_IMPROVEDINVISIBILITY`; no party member had that state in the party check's runs | the format and keys from `0x2e694c` on; the key is set while `proficiencies` is on top of the Lua stack (`Stats` is popped before it), which the party check's logged keys confirm |

**Spawned creatures against their files** (the spawn check, 2026-11-13): for creatures whose `.cre`
has no items and no effects, the walker's max HP, AC modifiers, THAC0, saves, resistances, magic
resistance and EA equal the file's, at Insane difficulty too. AC equals the file's effective AC plus
the AC column of `DEXMOD.2DA` for the creature's Dexterity: DEX 18 read 4 better than the file, DEX
24 read 6 better, as the table gives. Once the game runs these change like any creature's: attacked
by the party, a neutral creature read EA 255, and the dead read HP 0 and stay in the creature list.

**`C:CreateCreature(resref)`**, the console object's spawn, works from a script loaded with
`Infinity_DoFile`: `CLUAConsole::CreateCreature` (`0x1304e4`, bound at `0x1bc64`) checks the
`.cre` exists, builds the creature in the area on screen, and it can be read straight away. In the
spawn check's first run the creatures appeared east of the party.

**The portrait under the pointer** is not in engine memory but in `ui.menu`'s Lua: the global
`mouseOverPortrait`, set to the portrait's slot, 0 to 5, by each portrait button's `actionEnter` and
back to -1 by its `actionExit` (stock `ui.menu`, from `data/Patch2.bif` on this install). Portrait N is
party slot N, the order of the ids at game `+0x6618`: in the Under the pointer test (2026-11-14) the
first, last and a middle portrait each read their own party member.

**A key in `ui.menu`:** a `button` with no `area` and `on '<key>'`, as stock `ui.menu` binds `on '8'`
on character creation, receives the key while its menu is open. In the `WORLD_ACTIONBAR` menu, open
throughout play, `on 'e'` received `e` on the world screen, running and paused, and the game did not
act on the key itself (the Hotkey and install test, 2026-11-15).

EA groups, used to sort the listed creatures: friendly up to 30 (`GOODCUTOFF` in IESDP's `EA.IDS`),
hostile from 200 (`EVILCUTOFF`), neutral between. The engine's type-matching code (`0x3f3e8` to
`0x3f5c4`) compares EA with `0x1e`/`0x1f` and `0xc7`/`0xc8`. In the creature list's runs the party
read 2 (friendly), Illasera and three Black Reavers 255 (hostile), and Cespenar and Sarevok 128
(neutral).
