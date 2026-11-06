---
type: manual-test
title: "Bridge"
description: "One play session with the Phase 2 bridge loaded: the library checks every engine site, registers A7X_native into the game's Lua, and its four read functions answer from the debug console at the main menu, in a loaded game and after an area change. The gate for Phase 2."
duration: "about 10 minutes, 7 of them in the game"
---

# Manual test: Bridge

This session checks the Phase 2 bridge in the game. It shows whether the library accepts this build
(every engine function and anchor hashes as `native/builds.h` expects), registers the `A7X_native` table
once Lua is idle, and whether the four functions in it return what they should when called from the
game's own Lua. The functions only read, so the game should look and play exactly as usual. What the
bridge is and why it registers this way: [ADR-0005](../adr/0005-dyld-interposing-hook.md); the
functions themselves: [ADR-0002](../adr/0002-read-only-bridge-lua-walker.md#native-bridge).

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is on the commit under test**, with a clean `git status`. `git log -1 --oneline` names
  it; that is the commit the Runs row records.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console. `deno task doctor`
  reports it; edit it only while the game is closed.
- **A save to load**, in an area with an exit nearby. The bridge changes nothing, and the session needs
  no saving.
- **About 10 minutes.**

## Steps

The console lines below are typed exactly, one at a time, each followed by Enter. Each `T(…)` line
writes one `A7XT` line to the session log through `Infinity_Log`; nothing appears on screen. A typo
gives a `LUA ERROR` line in the log, which does no harm: type the line again.

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `build` should report `arm64, Signature=adhoc`. `play` names its session log and shows the
   library's own lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64 matched` and, within
   a second, `A7X registered A7X_native`.
2. **At the main menu, open the console** with Ctrl+Space and define the two helpers (1 minute):

   ```lua
   N = A7X_native
   function T(k, v) if type(v) == "number" then v = string.format("0x%x", v) end Infinity_Log("A7XT " .. k .. " " .. tostring(v)) end
   ```

3. **Call each function** (2 minutes):

   ```lua
   T("version", table.concat({N.Version()}, " "))
   T("root", N.Root())
   T("vtable", N.Read(N.Root(), "ptr"))
   T("bad", N.Read(16, "u32"))
   T("block", #N.ReadBlock(N.Root(), 64))
   T("cstr", type((N.Read(N.Root(), "cstr"))))
   ```

   Close the console with Ctrl+Space.
4. **Load the save**, then open the console again and type (1 minute):

   ```lua
   T("loaded", A7X_native ~= nil)
   T("vtable", N.Read(N.Root(), "ptr"))
   ```

5. **Change area** through an exit or a building door, and repeat the two lines of step 4 (2 minutes).
6. **Quit from the game's own menu**, not with Ctrl+C. `play` prints its summary and exits.

## What to watch for

The bridge passes every `glClear` through and only reads, so nothing should differ from normal play.
Stop and quit if you see:

- stutter or a lower frame rate;
- black or flickering frames;
- a freeze or a crash, especially right after typing a console line.

Then report what you saw and at which step. A failed run still counts, and its log up to that point is
the evidence.

## Pass criteria

Say "done" when `play` has exited. The newest `logs/session-<stamp>.log` is then read for lines starting
with `A7X`. To see them yourself: `grep 'A7X' logs/session-<stamp>.log`.

The run passes when every line below appears as described, there is no `A7X disabled` line, and the
game played normally:

| Check | Log line | Pass when |
| --- | --- | --- |
| Build and sites | `A7X build 2.7.3 arm64 matched, 13 sites checked, image at 0x…` | present |
| Registration | `A7X registered A7X_native at …s, glClear call …` | present once; no `lua_State changed` line |
| `Version` | `A7XT version 1 2.7.3 arm64` | exactly this |
| `Root` | `A7XT root 0x…` | an address, not `nil` |
| `Read` of a pointer | `A7XT vtable 0x…` | an address, not `nil` (see below) |
| A bad address | `A7XT bad nil` | `nil`, and the game kept running |
| `ReadBlock` | `A7XT block 0x40` | 64 bytes |
| `Read` of a string | `A7XT cstr string` | a string, not `nil` |
| After loading and after the area change | `A7XT loaded true` and `A7XT vtable 0x…` | `true` both times, and the same vtable as at the main menu |

A `LUA ERROR` line from a typo does not fail the run; one from a correctly typed line does.

One more value is recorded but is not a pass condition. EEex's headers describe `CBaldurChitin` as a
class with virtual functions, so its first 8 bytes should be a vtable pointer. Then the `vtable` value
minus the image address from the build line falls in `__DATA_CONST,__const` (`0x74c440` to `0x791db0`),
the only constant section of the game that holds pointers. If it does, that is evidence `Root` returns
the right object; if not, the delivery note says so and Phase 3 looks closer.

## Runs

No runs yet. Each run adds a row: the date, the commit it ran against, the result, and a link to the
delivery note that records it.
