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
`builds.h`. Its subcommands, in the order the steps use them:

| Command | Prints |
| --- | --- |
| `deno task re starts [from] [to]` | function starts, from the slice's `LC_FUNCTION_STARTS` |
| `deno task re xrefs <string>` | where the string sits in `__cstring`, and every `adrp` that loads its address |
| `deno task re annotate <start> [end]` | the disassembly to the next function start, with each loaded string and each call to a `builds.h` function named |
| `deno task re compare <symbol> <start> [end]` | the game function against the same symbol in stock `lapi.c` built at `-O2`: instruction counts and differing lines |
| `deno task re stats <getter>` | a `GetAtOffset`-style getter's table: each stat id with its offset, width and signedness |
| `deno task re hash <start> [size]` | a `builds.h` site line: offset, size (by default to the next function start) and FNV-1a hash |

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

## Engine structures

The structures the walker follows, all found in the engine function that fills `characters[id]` for
the record screen (`0x2e24c8`, about 32 KB, called by `Infinity_UpdateLuaStats` at `0x3391e0` with
the selected party member's sprite) or in code it calls. That function reads exactly the fields an
inspector needs, so its loads give the arm64 offsets directly; `deno task re annotate 0x2e24c8` shows
each `characters` key next to the load that feeds it. Offsets are sprite-relative unless stated:

| What | Where | Evidence |
| --- | --- | --- |
| `CInfGame*` | `g_pBaldurChitin + 0x10c0` | loaded by `Infinity_UpdateLuaStats` and by the stats function |
| Party ids, count | game `+0x6618` (6 `int32`), game `+0x6630` (`int16`) | `Infinity_UpdateLuaStats` indexes the ids by slot after checking the count |
| Object array slots | 16 bytes each from `0x35d8360`: `u16` generation at `+0`, pointer at `+8`; an empty slot has generation `0xffff` | the lookup `0x1ae26c`: an id's high 16 bits (masked to 15) are the slot, its low 16 bits the generation, which must match |
| Object array bounds | `int16` at `0x35d8350` (capacity), `0x35d8352` (highest slot in use), `0x35d8354` (next generation, from 2000) | the lookup, and the functions that add (`0x1ae3xx`) and clear (`0x1aeb1x`) objects |
| Object type | `u8` at `+0x8`; a sprite is `0x31` | ten engine sites compare it with `0x31` |
| Object id | `int32` at `+0x48` | `Infinity_UpdateLuaStats` sets the Lua global `id` from it; `characters` is keyed by it |
| EA | `u8` at `+0x30` or `+0x78`, the EA of the two `CAIObjectType`s at `+0x28` and `+0x70` | the type-matching code at `0x3f2xx` compares both; which is the live one is decided in the game (party members must read 2) |
| Stats blocks | `m_derivedStats` at `+0x1120`, `m_tempStats` at `+0x1dc0` (`0xca0` bytes each); `int32` at `+0x4e8c` (`m_bAllowEffectListCall`) non-zero means derived is current | the THAC0 code picks between them on that flag, the rule EEex follows |
| Each stat by `STATS.IDS` number | `CDerivedStats::GetAtOffset`, `0x7cd50`: ids 1 to 33 are `int16` at `2 * (id + 1)`, so `MAXHITPOINTS` `+0x4`, `ARMORCLASS` `+0x6`, the AC mods `+0x8` to `+0xe`, `THAC0` `+0x10`, saves `+0x14` to `+0x1c`, resistances `+0x1e` to `+0x32` (names as in IESDP's BG:EE `STATS.IDS`); id 151, `HITBONUS`, is `int16` at `+0x1f4` | `deno task re stats 0x7cd50` decodes all 202 from the getter's jump table |
| Base header | the creature's `.cre` header from file offset 0 at `+0x558`: name strref `+0x560` (file `0x08`), current HP `int16` `+0x57c` (file `0x24`), base saves `u8` `+0x5ac` (file `0x54`) | `characters[id].HP.current` and the save texts read these |
| THAC0 as shown | `derived[+0x10] - int32[+0x1204] - selected[stat 151, HITBONUS]`, or `0` when the weapon slot (`u8` `+0x10f8`, item pointers from `+0xfc0`) is empty | `characters[id].THAC0.current` |
| Name | strref `+0x560`, through `Infinity_FetchString`; when it is `-1`, the engine string at `+0x3910` (a `char*`) | the name branch and `0x2b0434` |
| Saves in `characters[]` | text only, in `savingThrows`: five `"%d (%d)"` pairs of derived and base value, death to spell | the format and keys from `0x2e694c` on |

Not here yet: the area a creature is in and the area on screen, for listing the creatures around the
party; they come with that work, after the party check.
