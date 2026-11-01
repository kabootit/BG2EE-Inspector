# Requirements

Everything needed to use the inspector, and what contributors need on top. Install these first, then run
`deno task doctor`, which checks each one and says what is missing. Nothing else is required: no Java,
Ghidra, Homebrew, radare2, Python or npm.

## For players

Each requirement, the version it was tested with, how to get it, and how `doctor` checks it:

| Requirement | Version | How to install | Why | Doctor checks |
| --- | --- | --- | --- | --- |
| Mac with Apple Silicon | arm64 | none | the inspector's library and address table target the game's arm64 slice; Intel Macs, which run the x86_64 slice, are unsupported | the running platform is `darwin aarch64` |
| macOS | tested on 14.6.1; the minimum is unknown | none | none | `sw_vers -productVersion` |
| Baldur's Gate II: Enhanced Edition | **2.7.3**, Steam build | Steam, default branch | engine addresses are specific to one executable; GOG and App Store builds are untested | SHA-256 of the executable against the supported list; arm64 slice present; both entitlements set |
| Xcode Command Line Tools, or full Xcode | tested with CLT 16.2 and Apple clang 16 | `xcode-select --install` (smaller), or Xcode from the App Store | `clang` builds the library from source and the linker ad-hoc signs it; no prebuilt binaries are shipped yet | `xcode-select -p`, `xcrun clang --version`, and a test build that must come out arm64 and `Signature=adhoc` |
| Deno | **2.9.8 or later** | the installer at deno.com, or `deno upgrade` | every task is a Deno program | the running version against `MIN_DENO`; every task checks this before it starts |
| WeiDU | **v251.00**, native arm64 | `deno task setup-weidu` (see below) | installs the inspector's patch to the game UI | SHA-256 of the binary against known builds, and its Mach-O architecture; WeiDU is never run to check it |

**Optional:** `Debug Mode` set to `1` under `Program Options` in
`~/Documents/Baldur's Gate II - Enhanced Edition/Baldur.lua`. It turns on the Ctrl+Space console, which the
inspector's console commands use; the hotkey works without it. Edit the file only while the game is
closed, because the game rewrites it from memory on exit. `doctor` reports the setting and never changes
it.

The game and user folders are found at their default Steam locations. To use other locations, set
`BG2EE_GAME_DIR`, `BG2EE_BINARY` or `BG2EE_USER_DIR`; note that `deno task doctor` is permitted to read
only the default locations, so a custom location also needs its `--allow-read` list in `deno.json`
extended.

## For contributors

Needed only to re-derive engine addresses after a game update, and to run the Lua unit tests:

| Requirement | Version | How to install | Why |
| --- | --- | --- | --- |
| `llvm-objdump`, `otool` | from the same Command Line Tools or Xcode | nothing extra; always run as `xcrun llvm-objdump` (there is no `/usr/bin/llvm-objdump` stub) | arm64 disassembly |
| Lua source | **5.2.4** | `deno task setup-dev` | a stock build is the reference for recognizing the game's stripped Lua functions, and builds the interpreter for the Lua unit tests. The game binary records only "Lua 5.2", so 5.2.4, the final 5.2 release, is the closest reference |

## The setup tasks

Both tasks download one pinned archive, check it against the SHA-256 published upstream before writing or
unpacking anything, install into `vendor/` (never committed), and do nothing when the same version is
already installed:

| Task | Downloads | Checksum source | Installs |
| --- | --- | --- | --- |
| `deno task setup-weidu` | `WeiDU-Mac-ARM-251.zip` from the WeiDU v251.00 GitHub release | GitHub's release asset digest: `ba050f5a02f56865667adee7ec1c525a34313928182301081b5ec278c29096be` | `vendor/weidu/weidu` (the archive's `WeiDU-Mac/weidu`, arm64) |
| `deno task setup-dev` | `lua-5.2.4.tar.gz` from lua.org | the sha256 column of `https://www.lua.org/ftp/`: `b9e2e4aad6789b3b63a056d442f7b39f0ecfca3ae0f1fc0ae4e9614401b69f4b` | `vendor/lua-5.2.4/` |

Files downloaded this way do not get macOS's quarantine attribute, so nothing needs clearing.

**To install WeiDU by hand instead:**

1. Download `WeiDU-Mac-ARM-251.zip` from the v251.00 release on WeiDU's GitHub page.
2. Check it: `shasum -a 256 WeiDU-Mac-ARM-251.zip` must print the digest above.
3. Unzip it. If a browser downloaded it, clear the quarantine flag:
   `xattr -d com.apple.quarantine WeiDU-Mac/weidu`.
4. Point the project at it: `export BG2EE_WEIDU=/path/to/WeiDU-Mac/weidu`.

WeiDU binaries left in the game folder by other mods (`setup-*`) are not used: they are whatever version
a mod shipped, often x86_64 only, which needs Rosetta.

## What has been verified

- **This development machine** (2026-11-01): every check passes, with Xcode selected and again with
  `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. The Command Line Tools alone are enough.
- **A clean machine** (no Xcode, no Command Line Tools, no Deno) is **untested**; see `TODO.md`.
