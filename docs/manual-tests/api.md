---
type: manual-test
title: "Data API"
description: "One play session with the inspector's Lua copied into override/: the console commands print records for the party and the creatures around it, deno task verify checks every A7XDATA line against the schema, and the tester compares a party member with the record screen. Confirms the public A7X API and the console output."
duration: "about 15 minutes, 10 of them in the game"
---

# Manual test: Data API

This session checks the inspector's public API, [docs/api.md](../api.md), in the game. The console
commands print each creature's record to the message window and write it to the log as an `A7XDATA`
line; `deno task verify` checks every line against the record's schema
([docs/data-model.md](../data-model.md)). The tester checks what no script can: the text is readable,
the colors look right, and a party member's values match the record screen. It also confirms the
inspector's memory-reading table is no longer reachable from other Lua once the API is in use.

The tester copies the inspector's six Lua files into the game's `override/` folder for the session;
the WeiDU component that installs them for good comes with the next part of Phase 4. In the game, the
tester types `Infinity_DoFile("a7x")` and the `A7X.show` commands below.

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

  Step 7 removes them again at the end.
- **A save in an area with creatures besides the party**, some of them hostile if possible. The party
  need not fight; pausing is fine, and the commands work paused.
- **About 15 minutes.**

## Steps

1. **Build and launch.**

   ```sh
   deno task build
   deno task play
   ```

   `play` shows the library's lines as they arrive: expect `A7X loaded`, `A7X build 2.7.3 arm64
   matched, 14 sites checked` and `A7X registered A7X_native`.
2. **Load the save** (1 minute).
3. **Load the inspector and show the party** (2 minutes). Open the console with Ctrl+Space and type
   these two lines, pressing Enter after each:

   ```lua
   Infinity_DoFile("a7x")
   A7X.show("party")
   ```

   The message window shows two lines per party member, such as
   `[A7X] Imoen  HP 40/52  AC 2  THAC0 15  MR 0%` and a line of saves and resistances, the name in
   color. A line starting `[A7X]` that says why, such as `loading`, means the API answered but could
   not read; no line at all means `a7x` did not load: check the six files are in `override/`.
4. **Show the others** (2 minutes). Type each, pressing Enter after each:

   ```lua
   A7X.show("enemies")
   A7X.show("all")
   A7X.show(A7X.list("all").creatures[1].id)
   A7X.show()
   ```

   `enemies` lists the hostile creatures, or says there are none; `all` lists every creature in the
   area; the third line shows the first of them again, found by its id, which tests `A7X.list` and
   `A7X.get`; `A7X.show()` shows the creature or portrait under the pointer, or, with the pointer on
   neither, prints how to call it. `enemies` and `all` each end with a summary line,
   such as `[A7X] all in AR0602: 12 shown, 0 not readable`; a command without one did not finish, so
   note what it printed instead. Every line the message window shows is also in the session log.
5. **Check the memory-reading table is private** (1 minute). Type:

   ```lua
   Infinity_DisplayString(tostring(A7X_native))
   ```

   The message window must show `nil`. Close the console with Ctrl+Space.
6. **Compare with the record screen** (2 minutes). Open the record screen for the party member listed
   first in step 3, and compare its HP, AC and the five saves with what step 3 printed. THAC0 may
   differ: the record screen subtracts the bonuses of the weapon in hand, the record does not. Note
   how the colors looked: the party's name color, and an enemy's if step 4 listed one.
7. **Quit from the game's own menu**, then remove the six files, and the `override/` folder if it is
   now empty:

   ```sh
   G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
   rm "$G/override/a7x.lua" "$G/override/a7xoff.lua" "$G/override/a7xwalk.lua" \
     "$G/override/a7xjson.lua" "$G/override/a7xfmt.lua" "$G/override/a7xapi.lua"
   rmdir "$G/override"
   ```

   `rmdir` refuses, harmlessly, if anything else is in the folder.
8. **Judge the run:**

   ```sh
   deno task verify
   ```

   It reads the newest session log and prints every `A7XDATA` record (side, id, HP, name) and whether
   each is a schema-1 record.

## What to watch for

The inspector only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after a command;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 8 has printed its result, with what step 6 found and how the colors looked. The
run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| Every record matches the schema | `deno task verify` | `verify: data passed, <n> line(s), every one a schema-1 record`, with a line for each party member |
| The memory-reading table is private | step 5 | the message window shows `nil` |
| Party values match the record screen | step 6 | HP, AC and the five saves equal; THAC0 may differ by the weapon's bonuses |
| No Lua errors | the session log | no `LUA ERROR` line |

The run records the colors without judging them: their byte order is a fact this run settles.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-14 | `bc17e13`, local changes | Failed on step 4: `A7X.show("all")` printed nothing and wrote no record, with no error; the message window's text was not in the log, so the log did not show the cause. Otherwise as expected: 12 `A7XDATA` lines, every one a schema-1 record; HP, AC and its modifiers of all six party members equal to the record screen (saves not compared by eye: the Stats tab shows none); `A7X_native` read `nil`; the colors showed with red and blue swapped, which settled the markup as `0xAABBGGRR`, and a fix after the run corrected them | [Data API](../notes/2026-11-14-data-api.md) |
| 2026-11-14 | `bc17e13`, local changes (summary lines, message text logged, colors fixed) | Passed: 25 `A7XDATA` lines, every one a schema-1 record; `party` 6, `enemies` 6 and `all` 12 shown, each with its summary line, in `AR6000`; the colors as intended, party light blue and enemies red; `A7X_native` read `nil`; no record screen compared this run, its party values having matched in the first | [Data API](../notes/2026-11-14-data-api.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a reader can match a Runs row to
the version of the test that judged it.

| Date | Commit | What changed | Criteria for runs before it |
| --- | --- | --- | --- |
| 2026-11-14 | the commit that adds the data API, after the first run | Step 4: `enemies` and `all` end with a summary line, and every message-window line is also in the session log, so a reader can tell a command that prints nothing from one that never ran; one creature the walker cannot read no longer stops the rest; the formatter writes the colors as `0xAABBGGRR` | no summary line, and the message window's text only on screen |
| 2026-11-14 | the commit that adds API 1.1 | Step 4: `A7X.show()` with no argument shows the creature or portrait under the pointer, and prints how to call it only when the pointer is on neither | `A7X.show()` always printed how to call it |
