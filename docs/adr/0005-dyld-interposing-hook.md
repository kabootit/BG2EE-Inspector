---
type: ADR
id: "0005"
title: "Reach the game's Lua by interposing glClear through dyld"
description: "The game registers its Infinity_* functions in code, so the planned luaL_Reg pointer swap has nothing to swap. The library instead asks dyld to route the game's glClear calls through a replacement, which registers the A7X_* functions once Lua is idle on the main thread and otherwise passes every call through. A hack, chosen because every alternative is impossible, unsafe or more invasive; gated on an in-game probe."
status: active
date: 2026-11-01
---

# ADR-0005: Reach the game's Lua by interposing glClear through dyld

**Status:** Active (the hook gate below passed in the game on 2026-11-06) · **Date:** 2026-11-01

## References

- [ADR-0001](0001-native-dylib-injection.md): how the library gets into the process; this ADR is how
  it then reaches the game's Lua.
- [ADR-0002](0002-read-only-bridge-lua-walker.md): the read-only bridge. Its hook, a swapped
  `luaL_Reg` pointer, is replaced by this decision; the rest of it stands.
- [Delivery note](../notes/2026-11-01-interposing-hook.md): the binary evidence, the probe library
  and how it was checked.
- [Hook gate note](../notes/2026-11-06-hook-gate.md): the gate's first run in the game, and its result.
- [Foundation plan](../plans/2026-11-01-inspector-foundation.md), Phases 1 and 2.
- Apple's dyld source, `include/mach-o/dyld-interposing.h`[^dyld-interposing]: the interposing tuple
  and section, as Apple's own macro declares them.
- Lua 5.2.4 source, `loadlib.c`[^lua-loadlib]: the message compiled in when native library loading
  is switched off.

## Context

### What the bridge needs

The inspector's Lua needs a handful of native functions (`A7X_Read` and the others in ADR-0002). Lua
can only call a C function that has been registered into its state. So the library needs one moment
when it can do that registration, and the moment has three conditions:

- **After the engine has created its Lua state.** Before that there is nothing to register into.
- **On the thread that runs Lua.** Lua is not thread-safe; touching a state from a second thread
  while the first uses it corrupts it.
- **While no Lua code is running.** Registration pushes onto the Lua stack and writes a global,
  which is ordinary for a C caller between Lua calls. In the middle of one, it would interleave with
  engine code the library cannot see, so the hook waits for an idle moment instead of reasoning
  about which interleavings are safe.

The library's constructor runs on the main thread, but before the game's `main`, so before the Lua
state exists. Something has to call into the library later, from the game's own main thread.

### The planned hook does not exist

ADR-0002 planned to find the static `luaL_Reg` table that pairs each `Infinity_*` name with its C
function, and swap the `Infinity_Log` entry for a wrapper. Phase 1 found no such table in the 2.7.3
arm64 binary:

- **The name exists, but no data points at it.** `"Infinity_Log"` is at `0x100653aee` in
  `__cstring`. A scan of every 8-byte word in `__DATA_CONST` and `__DATA` finds no pointer to it.
  The slice uses classic rebase information rather than chained fixups, so a stored pointer would
  appear as that exact address, and the scan would see it.
- **The functions are registered by code instead.** One function at `0x100335440` loads the engine's
  `lua_State*` global (`0x1035d7478`) and registers each function in turn, the expansion of Lua's
  `lua_register` macro. For `Infinity_Log`:

  ```text
  1003356e0  ldr  x0, [x21]            ; x21 = 0x1035d7478, the lua_State* global
  1003356e4  adrp x1, 0x100337000
  1003356e8  add  x1, x1, #0x684       ; 0x100337684, the C function behind Infinity_Log
  1003356ec  mov  w2, #0x0
  1003356f0  bl   0x10054b520          ; lua_pushcclosure(L, fn, 0)
  1003356f4  ldr  x0, [x21]
  1003356f8  adrp x1, 0x100653000
  1003356fc  add  x1, x1, #0xaee       ; "Infinity_Log"
  100335700  bl   0x10054bd88          ; lua_setglobal(L, name)
  ```

  The function makes 146 calls to `0x10054bd88`, and the binary holds 146 `Infinity_*` name strings.
- **The two callees match stock Lua 5.2.4.** `0x10054b520` has `lua_pushcclosure`'s shape: with no
  upvalues it stores the function and the type tag `0x16` (`LUA_TLCF`) at `L->top`, then advances
  `L->top` by 16 bytes. `0x10054bd88` has `lua_setglobal`'s: it fetches registry index 2
  (`LUA_RIDX_GLOBALS`) and interns the name. The offsets they use (`top` at 16, `l_G` at 24) equal
  `offsetof` on the vendored 5.2.4 source compiled for arm64.

Code cannot be patched under the hardened runtime, so the registration code itself cannot be
changed. With no table, there is no data pointer for the planned hook to swap.

### What can still be reached

- **Calls into system libraries go through data.** The game's code calls an imported function
  through a slot that dyld, the macOS dynamic loader, fills in at launch. The game imports 704 such
  symbols, among them `glClear`, `glViewport` and `glFinish` from OpenGL. SDL, the windowing
  library, is linked into the game itself, so its functions are not imports.
- **The library can call the game's own code.** Calling a function at a known address is allowed;
  only writing to code is not. So once the library is running on the right thread at the right time,
  it can register its functions with the game's `lua_pushcclosure` and `lua_setglobal`, exactly as
  the game does.

## Decision

**The library interposes `glClear`. The replacement passes every call straight to the real
`glClear`. Once, on the first call made on the main thread with the engine's Lua state created and
idle, it also registers the `A7X_*` functions by calling the game's own `lua_pushcclosure` and
`lua_setglobal`.**

The decision is staged. First, the library ships as a **probe** that interposes `glClear` and only
reports what it sees. Registration is added only after the probe passes the gate below in the game.

### How interposing works

dyld is the part of macOS that starts every program. Before the game's `main` runs, dyld loads the
libraries the game needs, connects the game's calls to them, and runs their start-up code.
`DYLD_INSERT_LIBRARIES` makes it load one more library first (ADR-0001).

Interposing is one more instruction to dyld, carried inside that library: a section named
`__DATA,__interpose` holding pairs of addresses, "replacement" and "original". While loading, dyld
binds every other image's calls to the original to the replacement instead. Calls from the
interposing library itself still reach the original, which is how the replacement calls the real
`glClear`. In the game's case that means the slot for `glClear` holds the library's function from
the start.

### Why this is a hack

It is, and the reasons are worth stating rather than hiding:

- **The game does not support it.** Nothing here is a mod interface Beamdog offers. It depends on
  the game being built with two entitlements, on the engine's internals at fixed addresses, and on
  behaviour observed rather than promised.
- **It borrows a drawing call as a clock.** The inspector has no interest in clearing the screen. It
  uses `glClear` only because the game calls it regularly on its main thread. That is a side effect
  of how the game renders, not a contract.
- **It replaces a function for the whole process.** Every caller of `glClear` in the game goes
  through the library's replacement.
- **The mechanism is not public API.** dyld implements interposing, and the AddressSanitizer runtime
  in Apple's Command Line Tools relies on it (its dylib carries a `__DATA,__interpose` section). But
  the header that defines it is in Apple's open-source dyld[^dyld-interposing], not in the macOS
  SDK, and `man dyld` does not mention it.

### Why the hack works

- **The game is signed to allow it.** The hardened runtime normally strips `DYLD_*` variables and
  refuses libraries signed by anyone else. The game's entitlements
  `com.apple.security.cs.allow-dyld-environment-variables` and
  `com.apple.security.cs.disable-library-validation` lift exactly those two restrictions. Checked on
  a stand-in executable signed with the hardened runtime: with both entitlements, the library
  loaded, interposed `glClear` and passed calls through; without them, macOS did not load the
  library at all.
- **dyld does the only write, as part of loading.** The library never changes a page's protection or
  writes to the game's memory. It hands dyld a table, and dyld fills the slot the way it fills every
  slot. To the game, the launch looks normal; its `glClear` slot simply holds a different address.
- **The hook point is an import, not an address.** `glClear` is found by name, so the hook survives
  game updates that keep using OpenGL. Only the Lua addresses are per build, and those are guarded
  by the build check.
- **The game's calls to `glClear` go through the slot.** The 2.7.3 binary lists `glClear` among its
  imports (`nm -u`), so at least one call site uses the slot dyld fills. Whether it is called once a
  frame on the main thread is what the probe checks.
- **Registration from the replacement is ordinary Lua use.** On the main thread, between Lua calls,
  a C caller pushing a function and setting a global is what the engine itself does 146 times at
  start-up. The library uses the engine's own functions, so there is one Lua runtime, not two.

### Safety rules

- **Read-only stays.** No `mprotect` anywhere in `native/` (stricter than ADR-0002, which allowed
  one), no write calls, and reads of game memory through `mach_vm_read_overwrite`.
- **One interposed function, enforced.** `lint:security` allows interposing only through the
  `A7X_INTERPOSE` macro and only for the functions in `ALLOWED_INTERPOSE` (`glClear`). Adding one is
  a design change for an ADR.
- **Always pass through.** Every call reaches the real `glClear`, whatever else happens, including
  when the build is unknown.
- **Fail closed.** The constructor matches the game's `LC_UUID` against `native/builds.h`. On no
  match it reads no game memory and will register nothing.
- **Register only when it is safe, and only once.** Only on the main thread (`pthread_main_np`),
  only once the `lua_State*` global is non-null, and only while `L->ci` points at `L->base_ci`,
  which in Lua 5.2 means no Lua or C function is executing on that state. After registering, the
  replacement is a counter and a pass-through.

### The hook gate

The probe in `native/a7x.c` reports to stderr, captured by `deno task play`. It passes when one
session of normal play, including loading a save and an area change, shows:

1. `A7X build 2.7.3 arm64 matched`;
2. the first `glClear` call on the main thread, and no report of a call off it;
3. the `lua_State` global becoming non-null;
4. periodic counts at roughly the frame rate (the game draws at most `Maximum Frame Rate` frames a
   second, set in `Baldur.lua` and 30 by default, so about 1800 calls a minute);
5. idle-Lua calls: the count of calls that found Lua running is below the total, so an idle frame
   exists to register on.

The game must also play normally for the whole session. If any of 2 to 5 fails, this decision is
re-evaluated before Phase 2 builds on it.

## Options considered

- **Interpose `glClear`** (chosen): the least invasive way left to run code on the game's main
  thread after its Lua starts. dyld performs the only write, at load time; the library needs no
  `mprotect`; the hook point survives updates.
- **Swap the `Infinity_Log` entry in the `luaL_Reg` table** (ADR-0002's plan): impossible; the table
  does not exist in this binary.
- **Have the game's Lua load the library itself** (`package.loadlib` or `require`): this would need
  no hook. Not possible: the binary contains Lua's message "dynamic libraries not enabled; check
  your Lua installation", which `loadlib.c` compiles in only when native loading is switched
  off[^lua-loadlib].
- **Patch the registration code or the game on disk**: forbidden at run time by the hardened
  runtime; on disk it breaks the game's signature and the entitlements with it, and Steam would
  restore the file. ADR-0001 rules out changing the game on disk.
- **Write the `glClear` slot from the constructor** (the fishhook technique): the same effect, but
  the library would make protected memory writable and write it itself, the kind of code
  `lint:security` forbids.
- **A background thread that calls into Lua when the state appears**: unsafe; Lua is not thread-safe
  and the game's main thread would be using the same state.
- **No hook: read memory from the library's own thread and print to the terminal**: safe, since it
  only reads, but nothing would appear in the game, which drops the hotkey and the message window.
  Kept as the fallback if the gate fails.
- **Interpose a different import**: `glViewport` and `glFinish` are also imported. A renderer
  typically clears once a frame; if the probe shows the game does not call it every frame, the probe
  moves to another import.

## Consequences

- **ADR-0002's hook is replaced.** Its native bridge is otherwise unchanged; the plan's Phase 2 and
  the architecture diagrams describe the interposing hook.
- **`lint:security` is stricter.** The one sanctioned `mprotect` is gone, and interposing is limited
  to an allowlist.
- **The Lua side cannot count on `A7X_native` at file load.** The engine may load `ui.menu` and the
  inspector's Lua files before its first frame, so before the hook has registered anything.
  `a7x_api.lua` therefore looks `A7X_native` up on first use, then captures it and clears the global
  as ADR-0002 describes; until then `A7X.status()` reports `no_native`. ADR-0002's plan registered
  on a call made from that Lua, so it never had this gap.
- **The library links OpenGL**, to call the real `glClear`; the game already loads the framework.
- **A frame-loop cost, once registered:** one counter and a pass-through per frame. The probe also
  reads one pointer per frame through `mach_vm_read_overwrite`, which goes once registration
  replaces it.
- **Re-evaluate** if the gate fails; if a game update drops OpenGL (a move to Metal would remove
  `glClear` from the imports, and the library would then simply never register, leaving the game
  unaffected); or if a macOS release stops honouring interposing for inserted libraries.

[^dyld-interposing]: dyld, Apple, `include/mach-o/dyld-interposing.h`,
    <https://github.com/apple-oss-distributions/dyld/blob/main/include/mach-o/dyld-interposing.h>

[^lua-loadlib]: Lua 5.2.4, `src/loadlib.c`, the `DLMSG` definition in the fallback branch taken when
    neither `LUA_USE_DLOPEN` nor `LUA_DL_DLL` is defined,
    <https://www.lua.org/source/5.2/loadlib.c.html>
