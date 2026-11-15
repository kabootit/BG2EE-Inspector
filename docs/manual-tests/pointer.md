---
type: manual-test
title: "Under the pointer"
description: "One play session with the inspector's Lua copied into override/: A7X.show() typed in the console with the pointer left over a creature, a party member, empty ground, a door or container, and each portrait. Confirms that CGameArea +0x244 holds the creature under the pointer and that portrait slot N is party slot N, before the hotkey builds on them."
duration: "about 10 minutes, 7 of them in the game"
---

# Manual test: Under the pointer

This session checks API 1.1's `A7X.hovered` and `A7X.portrait` ([docs/api.md](../api.md)) in the game,
through `A7X.show()` with no argument, the call the hotkey will make. The creature under the pointer
comes from the id the engine keeps in the area on screen at `CGameArea +0x244`; `deno task re id-fields`
found that offset by tallying the game's code, so only the game can confirm it. The portrait
comes from `mouseOverPortrait`, which stock `ui.menu` sets to 0 to 5 while the pointer is over a
portrait; the run confirms portrait N shows party slot N.

There is no hotkey yet: the tester types `A7X.show()` in the Ctrl+Space console while the pointer
rests where the step says. The keyboard types; the mouse does not move until the next step. The tester
copies the inspector's six Lua files into `override/` for the session, as for the [Data API](api.md)
test.

## Before you start

- **The game is not running.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **`Debug Mode` is 1** in `Baldur.lua`, so Ctrl+Space opens the Lua console in a loaded game.
- **The six files are in the game's `override/` folder.** From the repo folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  mkdir -p "$G/override"
  cp mod/inspector/lib/a7x.lua mod/inspector/lib/a7xoff.lua mod/inspector/lib/a7xwalk.lua \
    mod/inspector/lib/a7xjson.lua mod/inspector/lib/a7xfmt.lua mod/inspector/lib/a7xapi.lua "$G/override/"
  ```

  Step 9 removes them again at the end.
- **A save with a creature outside the party, and a door or container, in view** in the lower half of
  the screen, where the console does not cover them. Pausing is fine; the game can stay paused
  throughout.
- **About 10 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   Expect `A7X loaded`, `A7X build 2.7.3 arm64 matched, 14 sites checked` and
   `A7X registered A7X_native`.
2. **Load the save** (1 minute), and pause.
3. **Load the inspector** (1 minute). Open the console with Ctrl+Space, type
   `Infinity_DoFile("a7x")` and press Enter. Leave the console open for steps 4 to 8.
4. **A creature** (1 minute). Rest the pointer on a creature outside the party until its name tooltip
   shows; note the name. Without moving the mouse, type `A7X.show()` and press Enter. Expect two
   `[A7X]` lines for that creature, its name first.
5. **A party member on the ground** (1 minute). The same, with the pointer on a party member's
   figure in the area, not a portrait.
6. **Empty ground** (1 minute). The same, with the pointer on ground with nothing on it. Expect the
   line starting `[A7X] point at a creature or a portrait`; if a creature shows instead, note it, and
   which.
7. **A door or container** (1 minute). The same, with the pointer on a door or a container until it
   highlights. Expect `[A7X] not a creature`; note whatever else appears.
8. **The portraits** (2 minutes). The same, with the pointer on the first portrait, then the last, then
   one between; note each portrait's party member. Expect that member's two lines each time.
9. **Quit from the game's own menu**, then remove the six files, and the `override/` folder if it is
   now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7x.lua" "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" \
     "$G/override/a7xjson.lua" "$G/override/a7xfmt.lua" "$G/override/a7xapi.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
10. **Judge the run:**

    ```sh
    deno task verify
    ```

    It prints every `A7XDATA` record of the newest session log (side, id, HP, name) and whether each
    is a schema-1 record.

## What to watch for

The inspector only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after a command;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 10 has printed its result, with the names noted in steps 4, 5 and 8 and what
steps 6 and 7 showed. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| The creature under the pointer | steps 4 and 5 | the name shown is the creature's tooltip name, and the party member's |
| The portrait under the pointer | step 8 | each portrait shows its own party member |
| Every record matches the schema | `deno task verify` | `verify: data passed`, every line a schema-1 record, one for each record shown |
| No Lua errors | the session log | no `LUA ERROR` line |

The run records steps 6 and 7 without judging them: they settle what the engine keeps at `+0x244`
when the pointer is on no creature. If step 6 shows a creature, the field keeps the last id, and the
hotkey's design changes before the project builds it.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-14 | `1f56365`, local changes (API 1.1) | Passed: the creature (Hobgoblin Archer), a party member on the ground (Boom Boom) and the first, last and a middle portrait (Boom Boom, Song, Sender) each showed their own record, as the tooltips and portraits named them; empty ground printed the usage line and a door or container `not a creature`; 5 `A7XDATA` lines, every one a schema-1 record | [the hotkey and the install](../notes/2026-11-14-hotkey-install.md) |
