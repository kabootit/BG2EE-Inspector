---
type: manual-test
title: "Release install"
description: "A player's install of v0.1.0 from a fresh copy of the source, with nothing gitignored: every command of docs/install.md on this page, from setup-weidu to uninstall, with one play session in between; deno task verify judges the session's records. Confirms the install, the guide, and that the release needs nothing the working tree had lying around."
duration: "about 25 minutes, 10 of them in the game"
---

# Manual test: Release install

This run checks the v0.1.0 release as a player meets it
([first-release plan](../plans/2026-11-15-first-release.md)): a copy of the source with nothing
gitignored (no `vendor/`, `build/` or `logs/`), installed, played and uninstalled. Every command is
on this page, in the order [docs/install.md](../install.md) gives it, so the run needs no other page;
a pass shows that the release needs nothing the working tree had built or downloaded before, and
that the guide's commands work as written.

The copy holds every file git tracks and every new file it would track, so the run tests the local
working tree, committed or not.

## Before you start

- **The game is not running.**
- **No inspector install in the game.** From any folder:

  ```sh
  G="$HOME/Library/Application Support/Steam/steamapps/common/Baldur's Gate II Enhanced Edition"
  grep -i inspector "$G/WeiDU.log"
  ```

  A line starting `~INSPECTOR/INSPECTOR.TP2~` means the game has it: run
  `deno task install-mod --uninstall` from the repo folder first. No output, or only a
  `// Recently Uninstalled` line, means it does not.
- **A network connection,** for step 2's WeiDU download.
- **A save with a party member who can cast a spell with a duration,** such as Bless, and a creature
  outside the party in view.
- **About 25 minutes.**

## Steps

1. **Copy the source** (1 minute). Open Terminal in the repo folder, then:

   ```sh
   R="$TMPDIR/bg2ee-inspector-release"
   git rev-parse --show-toplevel && rm -rf "$R" && mkdir "$R" &&
     git ls-files -co --exclude-standard -z | xargs -0 tar -cf - | tar -xf - -C "$R" &&
     cd "$R" && ls
   ```

   The first line printed is the repo folder; `fatal: not a git repository` means Terminal is
   elsewhere, and nothing ran. `rm -rf` clears a copy an earlier run left, so no old build or log
   carries over. `ls` shows no `vendor/`, `build/` or `logs/`. Every later command runs in `$R`, in
   the same Terminal window.
2. **Fetch WeiDU** (1 minute):

   ```sh
   deno task setup-weidu
   ```

   It downloads WeiDU v251.00 into `vendor/` and checks it against its published SHA-256.
3. **Check the requirements** (1 minute):

   ```sh
   deno task doctor
   ```

   Every check passes. If one fails, stop: its line says what it checked and what it found.
4. **Build the library** (1 minute):

   ```sh
   deno task build
   ```

   Expect `build: build/inspector.dylib (arm64, Signature=adhoc)`.
5. **Install** (1 minute):

   ```sh
   deno task install-mod
   ```

   Expect the number of spell and item names found, WeiDU's output, then `install-mod: installed`.
6. **Play** (1 minute):

   ```sh
   deno task play
   ```

   The game starts. Expect `Inspector build 2.7.3 arm64 matched` and
   `Inspector registered Inspector_native` in Terminal.
7. **Use** (3 minutes). Load the save. Cast a spell with a duration on a party member, then press
   `e` over that member's portrait: three lines in the message window, the last `Spells` with the
   spell and its time left. Then press `e` over the creature outside the party: its three lines.
8. **Quit from the game's own menu.** `deno task play` ends with the game.
9. **Uninstall** (1 minute):

   ```sh
   deno task install-mod --uninstall
   ```

   Expect `install-mod: uninstalled`.
10. **Judge the run** (1 minute):

    ```sh
    deno task verify
    ```

    Expect `verify: data passed` and `verify: spells passed`.
11. **Keep the session log and remove the copy:**

    ```sh
    cd - && mkdir -p logs && cp "$R"/logs/session-*.log logs/ && rm -r "$R"
    ```

    The log goes into the repo's `logs/`, so the record of the run can cite it.

## What to watch for

Stop and report the step if:

- a command fails, or prints something this page does not lead you to expect;
- the run needed anything this page does not say;
- the game stutters, freezes or crashes.

## Pass criteria

Say "done" when step 10 has printed its result, with anything this page got wrong or left out. The
run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| A clean copy | step 1 | no `vendor/`, `build/` or `logs/` in `$R` |
| The install | steps 2 to 5 | each command as expected, with nothing done that this page does not say |
| Build and registration | step 6 | `Inspector build 2.7.3 arm64 matched` and `Inspector registered Inspector_native`, no `Inspector disabled` |
| Stats and spells | step 7 | `e` shows the party member's stats and its `Spells` line with the spell cast, and the other creature's record |
| Every record | step 10 | `verify: data passed` and `verify: spells passed` |
| No Lua errors | the session log, which step 11 keeps | no `LUA ERROR` line |
| The uninstall | step 9 | `install-mod: uninstalled` |

After the run, the guide gets the same check: its Install, Play and Uninstall sections hold the
commands of steps 2 to 6 and 9 with the same expectations, and the record of the run fixes there
anything the run found wrong.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-16 | `e0356bb`, local changes (the rename to `I`, the version, the release docs) | Passed, as the tester reported: every step as this page expects, with nothing this page got wrong or left out; `WeiDU.log` afterwards read `// Recently Uninstalled: ~INSPECTOR/INSPECTOR.TP2~ #0 #0 // BG2EE-Inspector: a creature's stats on one key: v0.1.0`, the install and uninstall under the new `VERSION`. Step 11 then deleted the session log with the copy, so no one has read it since | [the first release](../notes/2026-11-16-first-release.md) |

### Changes to this test

Each change to the steps or pass criteria after the first run, so a reader can match a Runs row to
the version of the test that judged it.

| Date | Commit | What changed | Criteria for runs before it |
| --- | --- | --- | --- |
| 2026-11-16 | the commit that records the first run | Step 1 stops when Terminal is outside the repo and clears a copy an earlier run left; step 11 keeps the session log in the repo's `logs/` | step 1 went on after `git` failed and reused an old copy, which the first try ran into; step 11 deleted the log |
