---
type: manual-test
title: "Hotkey and install"
description: "deno task install-mod installs the WeiDU component; one play session with no console: e over a creature, a party member, each portrait, empty ground and a door, running and paused; deno task verify checks every record; the uninstall puts override/ and WeiDU.log back as they were. Confirms the install, that e reaches ui.menu, and the uninstall."
duration: "about 20 minutes, 10 of them in the game"
---

# Manual test: Hotkey and install

This run checks the part of Phase 4 a player sees, as the
[hotkey and install plan](../plans/2026-11-14-hotkey-install.md) sets it out:
- `deno task install-mod` installs the WeiDU component with the project's pinned WeiDU;
- `ui.menu` loads the inspector at startup;
- the `e` key prints the record of the creature or party portrait under the pointer, with no console;
- `deno task install-mod --uninstall` takes it all out again.

The [Under the pointer](pointer.md) test already showed that `A7X.show()` finds the right creature and
portrait. The new questions are whether the WeiDU patch works and whether the world screen hands `e` to
`ui.menu` at all.

## Before you start

- **The game is closed.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **WeiDU is set up.** `deno task doctor` reports WeiDU v251.00 arm64; if not, run
  `deno task setup-weidu`.
- **No inspector files are in `override/`** from an earlier manual test. Step 1 shows what is there.
- **A save with a creature outside the party, and a door or container, in view.** The console is not
  needed, so `Debug Mode` does not matter.
- **About 20 minutes.**

## Steps

1. **Note the starting state** (1 minute). From the repo folder:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   ls "$G/override"; cat "$G/WeiDU.log"
   ```

   Keep the output: step 12 compares with it. A missing `override/` folder is fine.
2. **Install** (2 minutes):

   ```sh
   deno task install-mod
   ls "$G/override"; cat "$G/WeiDU.log"
   ```

   Expect WeiDU's output, then `install-mod: installed`. `override/` now holds `ui.menu` and the six
   files `a7x.lua`, `a7xapi.lua`, `a7xfmt.lua`, `a7xjson.lua`, `a7xoff.lua` and `a7xwalk.lua`, and
   `WeiDU.log` has a line for `INSPECTOR/INSPECTOR.TP2`. If WeiDU fails, stop here and report its
   output; nothing in the game has changed.
3. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   Expect `A7X loaded`, `A7X build 2.7.3 arm64 matched, 14 sites checked` and
   `A7X registered A7X_native`.
4. **Load the save** (1 minute). Leave the game running, not paused.
5. **A creature** (1 minute). Rest the pointer on a creature outside the party until its name tooltip
   shows; note the name; press `e`. Expect two `[A7X]` lines in the message window, that name first.
   If nothing appears, note whether `e` did anything else in the game.
6. **A party member on the ground** (1 minute). The same, with the pointer on a party member's figure.
7. **Each portrait** (2 minutes). Rest the pointer on each party portrait in turn and press `e`; note
   whom each showed.
8. **Empty ground, then a door or container** (1 minute). Press `e` over ground with nothing on it:
   expect the line starting `[A7X] point at a creature or a portrait`. Then over a door or container,
   once it highlights: expect `[A7X] not a creature`.
9. **Paused** (1 minute). Pause the game with the space bar, then repeat step 5 with any creature and
   step 7 with one portrait.
10. **Quit from the game's own menu.**
11. **Judge the session:**

    ```sh
    deno task verify
    ```

    It prints every `A7XDATA` record of the newest session log (side, id, HP, name) and whether each
    is a schema-1 record.
12. **Uninstall** (2 minutes):

    ```sh
    deno task install-mod --uninstall
    ls "$G/override"; cat "$G/WeiDU.log"
    ```

    Expect `install-mod: uninstalled`. `override/` should match step 1, apart from the empty folder
    WeiDU leaves behind, and `WeiDU.log` too, apart from one comment line it adds:
    `// Recently Uninstalled: ~INSPECTOR/INSPECTOR.TP2~ #0 #0 ...`. The game folder keeps an
    `inspector/` folder, the component's own files, which a reinstall reuses.

## What to watch for

The inspector only reads, and WeiDU changes only `override/` and `WeiDU.log`. Stop and report if you
see:

- WeiDU failing in step 2 or 12, with its output;
- stutter, a freeze or a crash in the game;
- `e` doing something in the game besides printing.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 12 has printed its result, with the names noted in steps 5 to 7 and what steps 8
and 9 showed. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| The install | step 2 | `install-mod: installed`; `ui.menu` and the six files in `override/`; the inspector's line in `WeiDU.log` |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| `e` reaches `ui.menu` | step 5 | `[A7X]` lines appear when `e` is pressed |
| The creature and the portraits | steps 5 to 7 | each shows the creature, party member or portrait it was pressed over |
| Nothing to show | step 8 | the usage line over empty ground, `not a creature` over a door or container |
| Paused | step 9 | the same as running |
| Every record matches the schema | `deno task verify` | `verify: data passed`, every line a schema-1 record |
| No Lua errors | the session log | no `LUA ERROR` line |
| The uninstall | step 12 | `install-mod: uninstalled`; `override/` as in step 1 but empty; `WeiDU.log` as in step 1 plus the `Recently Uninstalled` comment |

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
