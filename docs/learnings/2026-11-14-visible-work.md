---
title: "Working visibly: what the chat shows decides what can be reviewed"
description: "How an AI assistant's work became hard to follow: about 110 one-off scripts, most of them file edits, shown in the chat as one-line summaries, with the analyses behind two engine findings among them. What Claude Code offers for seeing tool calls, why three working practices fix what settings cannot, and what the practices cost."
---

# Working visibly: what the chat shows decides what can be reviewed

A learning piece from the inspector's Phase 4. The project is built with an AI assistant, Claude Code,
working in the VS Code panel, and a tester who reviews each change and runs it in the game. Halfway
through Phase 4 the tester found the work "a little too black box": the chat showed what was done
only as one-line summaries. This piece records why, what the tool itself offers, and the three
practices adopted instead. The shape is general: when one party does the work and another must
review it, the way the work is done decides what the reviewer can see.

## The problem

By the end of the data API work, the session's temporary folder held about 110 small Deno scripts.
Most were file edits: read a file, replace one string with another, write it back. The rest were
analyses: tallies over a disassembly of the game, or checks of a file the game ships.

Each ran as a shell command, and the chat panel shows a shell command as a collapsed row with a short
description. The tester saw, for example:

```text
Bash  Update the walker's offsets table
```

and not the script, nor the lines it changed. Two kinds of work went unseen:

- **Edits.** A replacement made by a script reaches the file without a diff in the chat. The change
  was visible only later, in `git diff`, mixed with everything else.
- **Analyses that became facts.** The creature list plan found a creature's area at object `+0x18`,
  and the hotkey plan found the creature under the pointer at area `+0x244`, each from a scratch script
  that counted instruction patterns in the disassembly. The plans cite both findings; the scripts
  that produced them were in a temporary folder that is deleted with the session. Nobody could re-run
  them after a game update, or read them to judge the method.

## What the tool offers

Claude Code's documentation was checked for a way to see tool calls in full:

| Option | What it does | Limit here |
| --- | --- | --- |
| `"verbose": true` or `"viewMode": "verbose"` in `~/.claude/settings.json` | shows each tool call and its output in full in the terminal | the documentation does not say whether the VS Code panel honors it |
| the session transcript, `~/.claude/projects/<project>/<session>.jsonl` | every message and tool call, on disk | an internal format, not meant for reading; kept for 30 days |
| `/export` | writes the conversation to a file | documented for the command line; after the fact, not while reviewing |

Each of these helps someone who goes looking, after the fact or in another tool. None puts the change
in front of the reviewer at the moment it is made, and none turns a scratch analysis into something
that outlives the session.

## The three practices

Adopted on 2026-11-14 and written into
[working-together.md](../rules/working-together.md#how-to-apply) and `CLAUDE.md`.

### 1. File changes go through the Edit tool

The Edit tool takes the exact text to replace and its replacement, and the chat shows the call as a
diff. Before, an edit to the walker's offsets looked like this, run as a scratch script:

```ts
// scratchpad/edit-offsets.ts
const path = "mod/inspector/lib/a7xoff.lua";
const text = await Deno.readTextFile(path);
await Deno.writeTextFile(
  path,
  text.replace(`    resref_size = 8,\n`, `    resref_size = 8,\n    picked = { 0x244, "i32" },\n`),
);
```

and the chat showed a one-line description of it. After, the same change is an Edit call whose old
and new text are the call itself:

```lua
    resref_size = 8,
    picked = { 0x244, "i32" },
```

shown as one added line in context. The Edit tool also fails when the old text is not found exactly
once, which a `replace` in a script does silently: a script that matches nothing writes the file back
unchanged and reports success.

A script is still used for an edit too large or repetitive for the Edit tool, such as the same change
across dozens of files. It is then named, with its full path, when it runs, so it can be opened.

### 2. Analysis the docs cite becomes project tooling

A finding the docs rely on needs its method kept with it. The project already does this for code
sites: `deno task re` finds, hashes and checks every address the native library uses, and its tests
run on every `deno task test`. The two disassembly tallies joined it in the hotkey work, rewritten
to decode the game's instruction bytes directly, as the rest of `re` does, so their tests need no
disassembler:

- `deno task re area-fields`: the object fields the engine compares with the area on screen
  (the creature's area at `+0x18`);
- `deno task re id-fields`: the area fields the engine compares with an object's own id (the creature
  under the pointer at `+0x244`).

Each gets a test on a small synthetic disassembly, so the method is checked, and a test on the real
game that expects the documented offset, so a game update that moves it fails a test instead of the
inspector. Both reproduced the scratch scripts' counts exactly: `+0x18` at 14 sites, `+0x244` at 24.
[The reverse-engineering notes](../re-notes.md#redoing-this-after-a-game-update) cite the commands
as the way to re-check each finding.

### 3. Other one-off scripts stay in the scratchpad, named

Not every check deserves tooling: a quick count, a look at one file, a check that answers a question
in a conversation and is never cited. These stay in the session's scratchpad, and each is named with
its full path and its purpose when it runs, so the reviewer can open it while it still exists.

## Why practices, not settings

A setting changes how much of a tool call the panel shows. It does not change what the tool call is.
A script that edits a file is opaque in any view: even printed in full, it is code that describes a
change, not the change. An Edit call is the change. Likewise no view keeps a scratch analysis after
the session ends; only moving it into the project does. The practices work in every view, the
terminal and the panel alike, and they leave something behind in the repository where a setting
leaves nothing.

## What it costs

- **Speed.** Several Edit calls take longer than one script that makes the same replacements. The
  difference is small next to the time a reviewer spends finding an unseen change later.
- **Tooling to maintain.** Two more `re` subcommands and two more instruction decoders, with their
  tests, must keep working as the game changes. That is the point: a method that stops working
  after an update is better found by a failing test than by a wrong offset in the game.
- **Judgment.** Which analyses become tooling is a call each time. The line drawn here: if a doc
  states its result as fact, its method is kept and tested.
