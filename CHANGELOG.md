# Changelog

Each release of BG2EE-Inspector, newest first: what it does, what it needs, and what it does not do
yet. The installation guide is [docs/install.md](docs/install.md).

## 0.1.0 (2026-11-16)

The first release: an in-game inspector for Baldur's Gate II: Enhanced Edition on macOS.

### What it does

- **Press `e`** with the pointer over a creature or a party portrait: the message window shows its
  HP, AC, THAC0, saving throws, resistances and magic resistance, then its active spells by name with
  the game time left on each (`Spells Bless 34s, Haste 1m 42s`).
- **Console commands** (Ctrl+Space, with `Debug Mode` on): `I.show("enemies")`,
  `I.show("party")` or `I.show("all")`.
- **For other mods and tools:** the `I` Lua table inside the game, and an `INSPECTOR_DATA` JSON line in the
  game's log for every record shown ([docs/api.md](docs/api.md), [docs/data-model.md](docs/data-model.md)).

### What it needs: Deno, for now

This release installs and runs through Deno, the way its own tests do: `deno task install-mod`
installs the WeiDU component, and `deno task play` starts the game with the inspector's native
library loaded. **A game started any other way, from Steam or the Finder, runs without the
inspector.** It also needs the Xcode Command Line Tools, to build the library on the player's Mac.
The steps are in [docs/install.md](docs/install.md).

**Planned: a WeiDU-compatible install** that needs no Deno, installed like any other mod, with the
game started the usual way. macOS loads the inspector's library only when the game starts with it,
and the game's own Lua cannot load one, so that install needs one of the approaches `TODO.md` lists.

### What it supports

- **Baldur's Gate II: Enhanced Edition 2.7.3, the Steam build, on a Mac with Apple Silicon.** Engine
  addresses differ between builds. On any other build the library turns itself off and prints
  `Inspector disabled: unknown build <uuid>`; open an issue with that line to ask for the build.
- **The game in Steam's default folder.** Another location needs `BG2EE_GAME_DIR` and the
  permission lists in `deno.json` extended ([docs/install.md](docs/install.md#a-game-in-another-folder)).

### Known limits

- **Other mods: untested.** A mod that rewrites `ui.menu` can remove the inspector's hotkey; run
  `deno task install-mod` again after installing it.
- **The bard song shows its resource name,** `FJBARDB`: no game file gives it a name.
