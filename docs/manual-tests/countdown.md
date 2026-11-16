---
type: manual-test
title: "Spell countdown"
description: "deno task install-mod with the names table; one play session: Bless cast on the party, e over a portrait at once and every few seconds until the icon goes, then e over a creature outside the party with a spell on it; deno task verify checks every record's spells against the game files. Confirms the spells line and the record's effects, Phase 5 part 3."
duration: "about 20 minutes, 10 of them in the game"
---

# Manual test: Spell countdown

This run checks what part 3 of Phase 5 adds for a player and a mod
([spell-output plan](../plans/2026-11-15-spell-output.md)):

- **The spells line:** `e` prints a third line, `Spells`, with each active spell by the name the game
  shows and its time left in game time, soonest first.
- **The countdown:** the time left starts at the spell's duration, falls as the game runs, and the
  spell leaves the line when its icon leaves the portrait.
- **Every creature:** a creature outside the party shows its spells too.
- **The record:** each `A7XDATA` line carries the same spells as `effects`, and `deno task verify`
  checks each name against the game files and each time against the spell file.

The [Effect duration](durations.md) test proved the clock, the rate and removal through a probe. This
run checks the same countdown as the player sees it, and the names, which come from the names table
`deno task install-mod` writes and `Infinity_FetchString` in the game.

## Before you start

- **The game is not running.** `play` starts it.
- **The repo is in the state to test.** Committed or not; the run tests the local working tree, and
  the Runs row notes the latest commit and whether there were local changes.
- **The pinned WeiDU is in place.** `deno task doctor` reports WeiDU v251.00 arm64; if not, run
  `deno task setup-weidu`.
- **`Debug Mode` is 1** in `Baldur.lua`, for step 7's console.
- **A save with a party member who can cast Bless**, and a creature outside the party in view that a
  party member can cast a spell on: an enemy to hold, slow or curse, or a neutral to bless or haste.
  Bless's icon lasts 36 seconds at every level.
- **About 20 minutes.**

## Steps

1. **Build and install** (2 minutes). From the repo folder:

   ```sh
   deno task build
   deno task install-mod
   ```

   Expect `install-mod: <n> spell and item names found in the game's files`, a number in the
   thousands, then WeiDU's output and `install-mod: installed`.
2. **Launch** (1 minute):

   ```sh
   deno task play
   ```

   Expect `A7X loaded`, `A7X build 2.7.3 arm64 matched, 14 sites checked` and
   `A7X registered A7X_native`.
3. **Load the save** (1 minute).
4. **Cast Bless** (1 minute) on the party, with the game running. The moment its icon appears on a
   portrait, press `e` over that portrait. The message window shows the member's stats, then
   `Spells ... Bless <n>s`. Note the time shown.
5. **Watch the countdown** (1 minute). Press `e` over the same portrait every 5 seconds or so; each
   time Bless shows less time left. The moment the icon leaves the portrait, pause with Space and
   press `e` once more: Bless is no longer on the `Spells` line. Note the time Bless showed on the
   press before it.
6. **A creature outside the party** (2 minutes). Unpause, cast a spell with a duration on a creature
   outside the party, and press `e` over the creature while the spell lasts. Note the spell and what
   the `Spells` line shows.
7. **The party in the console** (1 minute). Open the console with Ctrl+Space, type
   `A7X.show("party")` and press Enter: three lines per member and a summary line. Close the console.
8. **Quit from the game's own menu.**
9. **Uninstall** (1 minute):

   ```sh
   deno task install-mod --uninstall
   ```

   Expect `install-mod: uninstalled`.
10. **Judge the run:**

    ```sh
    deno task verify
    ```

    It lists every record and each creature's spells, then checks each name and time against the
    game's files.

## What to watch for

The inspector only reads, so nothing should differ from normal play. Stop and quit if you see:

- stutter, or a freeze right after pressing `e`;
- a crash.

Then report what you saw and at which step.

## Pass criteria

Say "done" when step 10 has printed its result, with the times noted in steps 4 and 5 and what step 6
showed. The run passes when:

| Check | Where | Pass when |
| --- | --- | --- |
| The install | step 1 | thousands of names found, `install-mod: installed` |
| Build and registration | `A7X build 2.7.3 arm64 matched, 14 sites checked` and `A7X registered A7X_native` | both present, no `A7X disabled` |
| Bless by name | step 4 | `Spells` names `Bless`, with 30 to 36 seconds left |
| The countdown | step 5 | each press shows less time; the press after the icon goes lists no Bless, and the press before it showed 10 seconds or less |
| Outside the party | step 6 | the creature's `Spells` line names the spell cast on it, with time left |
| Every record and its spells | `deno task verify` | `verify: data passed` and `verify: spells passed`: every name as the game files give it, every time within its spell file's duration |
| No Lua errors | the session log | no `LUA ERROR` line |
| The uninstall | step 9 | `install-mod: uninstalled` |

A spell from an item, such as a potion, has no spell file, so `verify` checks its name but not its
time. A helper spell shows its parent's name (`SPCL920A`, Enhanced Bard Song), and a source with no
name at all, such as the bard song's `FJBARDB`, shows its resref.

## Runs

Each run adds a row: the date, the commit it ran against, the result, and a link to the delivery note
that records it.

| Date | Commit | Result | Delivery note |
| --- | --- | --- | --- |
| 2026-11-15 | `3dcf372`, local changes (the names table, the record's `effects`, the spells line) | Passed (`session-20261115-185434`): the install found the names and installed; on Boom Boom, Bless read 33, 27, 21, 16, 11, 8, 5 and 1 seconds across eight presses, and the press after its icon went listed none; THAC0 read 11 while Bless lasted and 12 without it; Protection From Evil counted down from 2m 42s; the Hobgoblin Archer showed `Command 6s`, which the party cast on it, and `Bless 35s`, the Hobgoblin Captain `Bless 35s`, both from the hobgoblins' own priest, as the tester confirmed; `A7X.show("party")` gave six members, each with the bard song's `FJBARDB`; `verify` passed 22 `A7XDATA` lines and 4 sources, every name as the game files give it and every time within its spell file; no `LUA ERROR`; the uninstall left `override/` empty | [spells in the output](../notes/2026-11-15-spell-output.md) |
