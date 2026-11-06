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

The two globals and the code that anchors each:

| Global | Offset | Anchor | How it was found |
| --- | --- | --- | --- |
| The engine's `lua_State*` | `0x35d7478` | `0x335440`, `0x20` bytes: the start of the `Infinity_*` registration function, whose `adrp x21`/`add #0x478` at `+0x10` load it | Every registration in that function passes `[x21]` as `L` (ADR-0005) |
| `g_pBaldurChitin` | `0x35d70d0` | `0x2140c`, `0x2c` bytes: the whole tolua getter | The string `"g_pBaldurChitin"` (`0x63dbad`) is passed to a tolua variable binding at `0x18e34` with getter `0x2140c`; the getter loads `[0x1035d70d0]` and pushes it as a `"CBaldurChitin"` userdata. This is the object behind the game's Lua global `e` |

Both are in `__DATA,__common`, so they read as zero until the engine sets them. The hook gate saw the
`lua_State*` set by the first `glClear`.

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
To add one, from the repo folder with the new game installed (`<game binary>` is the executable inside
the app bundle, `<dir>` any scratch folder):

1. **Extract the slice and list function starts.**

   ```sh
   lipo -thin arm64 -output <dir>/game-arm64 "<game binary>"
   xcrun dyld_info -function_starts <dir>/game-arm64 > <dir>/starts.txt
   xcrun dwarfdump --uuid <dir>/game-arm64
   ```

   `llvm-objdump --start-address` disassembles the whole file when given a universal binary, so always
   work on the thin slice.
2. **Build the reference.**

   ```sh
   xcrun clang -arch arm64 -O2 -c vendor/lua-5.2.4/src/lapi.c -o <dir>/lapi.o
   ```

   `deno task setup-dev` fetches the source if `vendor/lua-5.2.4/` is missing.
3. **Find `Infinity_Log`'s C function again.** The string `"Infinity_Log"` is in `__cstring`; the
   registration function loads it with `adrp`/`add` just before a call to `lua_setglobal`, after loading
   the C function's address the same way before a call to `lua_pushcclosure`. Its calls give
   `lua_tolstring`, `lua_pcallk` and `lua_settop`, and the registration function gives
   `lua_pushcclosure`, `lua_setglobal` and the `lua_State*` global.
4. **Place the rest by size.** Starting from those, walk the function starts in `lapi.c` order and match
   each gap against the reference's symbol sizes (`nm -n <dir>/lapi.o`). Confirm each candidate by
   comparing

   ```sh
   xcrun llvm-objdump -d --no-show-raw-insn --disassemble-symbols=_lua_setfield <dir>/lapi.o
   xcrun llvm-objdump -d --no-show-raw-insn --start-address=<start> --stop-address=<end> <dir>/game-arm64
   ```

   Relocated loads (`ldr` from the GOT in the object file, `add` in the linked game) and instruction
   order may differ; anything else is a reason to look closer.
5. **Find `g_pBaldurChitin`** from the string `"g_pBaldurChitin"`: the tolua binding passes it next to
   the getter's address, and the getter loads the global.
6. **Write the entry** in `native/builds.h` with each offset and size and any hash, then run
   `deno task test`. The builds test names every site whose hash differs and prints the hash it found;
   check that each finding is only the placeholder hash, copy the hashes in, and run it again until it
   passes. Then the in-game manual tests for the bridge decide whether the entry is right.

## Not covered yet

The engine structures the walker reads (`CInfGame`, the object array, `CGameSprite`, `CDerivedStats`,
the effect lists) are found in Phase 3 of the
[foundation plan](plans/2026-11-01-inspector-foundation.md) and recorded here then.
