# Installing BG2EE-Inspector

How to install the inspector on a Mac, play with it, and remove it. This is the guide for v0.1.0,
which installs and runs through Deno; a WeiDU-compatible install that needs no Deno comes in a later
release ([CHANGELOG.md](../CHANGELOG.md)). Every step here is one a tester has run
([Release install](manual-tests/release.md)).

## Requirements

- **A Mac with Apple Silicon.** Intel Macs are unsupported.
- **Baldur's Gate II: Enhanced Edition 2.7.3, the Steam build,** in Steam's default folder (see
  [A game in another folder](#a-game-in-another-folder) otherwise). On any other build the inspector
  turns itself off; see [Trouble](#trouble).
- **Deno 2.9.8 or later,** from deno.com.
- **The Xcode Command Line Tools,** to build the inspector's library: `xcode-select --install`.

[requirements.md](requirements.md) lists each requirement with the version tested and how
`deno task doctor` checks it.

## Get the source

Download "Source code (zip)" from the v0.1.0 release on the project's GitHub page and unzip it, or
clone it:

```sh
git clone --branch v0.1.0 https://github.com/kabootit/BG2EE-Inspector.git
```

Open Terminal in that folder; every command below runs there.

## Install

Close the game first. Then:

```sh
deno task setup-weidu
deno task doctor
deno task build
deno task install-mod
```

- **`setup-weidu`** downloads WeiDU v251.00, the mod installer, into `vendor/` and checks it against
  its published SHA-256.
- **`doctor`** checks every requirement and says what is missing. Fix what it reports before going
  on.
- **`build`** compiles the inspector's library into `build/inspector.dylib`.
- **`install-mod`** installs the WeiDU component: the game then loads the inspector at startup, and
  the `e` key works in play. Expect `install-mod: installed`.

## Play

**Start the game with this, every time:**

```sh
deno task play
```

It starts the game with the inspector's library loaded and keeps a log of the session in `logs/`.
Expect `Inspector build 2.7.3 arm64 matched` and `Inspector registered Inspector_native` in Terminal.

**A game started from Steam or the Finder runs without the inspector,** and `e` then does nothing.

## Use

- **Press `e`** with the pointer over a creature or a party portrait. The message window shows its
  stats, then its active spells with the game time left on each:

  ```text
  [Inspector] Imoen  HP 32/32  AC 4  THAC0 17  MR 0%
        Saves D11 W13 P12 B15 S12  Resist none
        Spells Bless 34s, Haste 1m 42s
  ```

  Over anything else it says how to use it.
- **Or use the console.** Set `Debug Mode` to `1` under `Program Options` in
  `~/Documents/Baldur's Gate II - Enhanced Edition/Baldur.lua` with the game closed, then press
  Ctrl+Space in play and type `I.show("enemies")`, `I.show("party")` or `I.show("all")`.

The times count game time, as spell durations do: they stand still while the game stays paused.

## Uninstall

```sh
deno task install-mod --uninstall
```

Expect `install-mod: uninstalled`. Then delete the source folder.

## A game in another folder

The tasks look for the game in Steam's default folder. For a game elsewhere, such as another Steam
library:

1. Set `BG2EE_GAME_DIR` to the folder that holds `chitin.key` and the game's `.app`, for example
   `export BG2EE_GAME_DIR="/Volumes/Games/SteamLibrary/steamapps/common/Baldur's Gate II Enhanced Edition"`.
2. Add that folder to the `--allow-read` lists of the `doctor`, `install-mod`, `play` and `verify`
   tasks in `deno.json`, and to `install-mod`'s `--allow-write` with `/inspector` after it: Deno lets
   each task read and write only the folders its list names.

`BG2EE_BINARY` and `BG2EE_USER_DIR` set the game's executable and its user folder (saves and
`Baldur.lua`) the same way ([requirements.md](requirements.md)).

## Trouble

- **`Inspector disabled: unknown build <uuid>`:** the game is a build the inspector does not know, such as
  another store's or a later version. The game runs normally without it. Open an issue on the
  project's GitHub page with that line.
- **`e` does nothing:** the game started without `deno task play`, or a mod installed since has
  rewritten `ui.menu` and removed the hotkey; run `deno task install-mod` again.
- **`doctor` reports a failure:** each line says what it checked and what it found; fix that and run
  it again.
