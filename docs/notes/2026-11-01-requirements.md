---
title: "Step 1, requirements: Delivery Notes"
description: "docs/requirements.md, deno task doctor, and the two pinned setup tasks (WeiDU v251 arm64 and the Lua 5.2.4 source), with every download checked against an upstream checksum and every system binary run by absolute path."
---

# Step 1, requirements: Delivery Notes

> Delivery record for Step 1 of the [foundation plan](../plans/2026-11-01-inspector-foundation.md).
> [ADR-0003](../adr/0003-toolchain.md) records why the toolchain looks like this.

## Status

**Built, every requirement met on the development machine, committed and pushed** on `main` and the
marker branch `initial/02-requirements`, as three focused commits that each pass lint on their own.

| Piece | State |
| --- | --- |
| `docs/requirements.md` | Done; linked first from the README's Installation section |
| `deno task doctor` | Done; all 14 checks pass here, with Xcode and with the Command Line Tools alone |
| `deno task setup-weidu` | Done; installs WeiDU v251.00 arm64, idempotent |
| `deno task setup-dev` | Done; installs the Lua 5.2.4 source, idempotent |
| Clean machine | Untested (TODO.md) |

## Plan summary

Step 1 turns the plan's requirements table into a document, a checker and two installers:

- **One document** a new player or contributor can follow from nothing.
- **A read-only checker** that names what is missing without running the game or WeiDU.
- **The only two downloads the project needs,** pinned and checked against checksums published upstream.

## What was built

### Code

The new modules, by folder (see "src layout" in [architecture.md](../architecture.md#src-layout)):

| Path | Content |
| --- | --- |
| `src/shared/config.ts` | Paths with environment overrides, the supported game build, required entitlements, the two pinned downloads, known WeiDU builds, absolute paths of system binaries |
| `src/shared/sha256.ts` | SHA-256 through Web Crypto |
| `src/re/macho.ts` | Architectures of a thin or universal Mach-O, from the header alone |
| `src/setup/system.ts` | The `System` interface (commands as argument arrays, files) and its real implementation |
| `src/setup/doctor.ts` | The 14 checks, each a function of a `System` |
| `src/setup/download.ts` | Fetch, then check the SHA-256 before anything is written |
| `src/setup/install.ts` | `installWeidu` (ditto, finds the one `weidu` binary, requires arm64) and `installLuaSource` (tar) |
| `src/tasks/doctor.ts`, `setup_weidu.ts`, `setup_dev.ts` | Entry points |
| `test/setup/`, `test/re/`, `test/shared/sha256_test.ts` | A fake `System` describes other machines: Intel, unknown game build, missing entitlements, old WeiDU, checksum mismatch |

### Permissions

Each task gets only what it touches:

| Task | Reads | Writes | Network | Runs |
| --- | --- | --- | --- | --- |
| `doctor` | the repo, the game folder, the user folder | `build/` | none | `sw_vers`, `plutil`, `codesign`, `xcode-select`, `xcrun` |
| `setup-weidu` | the repo | `vendor/` | `github.com` and its release-asset hosts | `ditto`, `xattr` |
| `setup-dev` | the repo | `vendor/` | `www.lua.org` | `tar` |

## Gotchas worth remembering

- **Facts established before relying on them** (per working-together.md):
  - **Checksums are published upstream:** GitHub publishes a SHA-256 digest for each release asset, and
    lua.org lists sha256 checksums. Neither download is trust-on-first-use.
  - **Archive layout:** the WeiDU archive holds the binary at `WeiDU-Mac/weidu`. The installer still
    searches for exactly one `weidu` rather than hard-coding the path.
  - **Quarantine:** files downloaded by Deno carry no `com.apple.quarantine` attribute.
  - **Task shell:** `deno task` expands `$HOME` inside a quoted, comma-joined `--allow-read` list, and the
    apostrophe in `Baldur's Gate` survives. Tested in a scratch folder: the game folder was readable and a
    path outside the list was denied.
- **A `BG2EE_BINARY` override was half-checked at first:** the version and entitlements came from the real
  game's bundle. Entitlements are now read from the executable being checked, which the test with WeiDU as
  the "game" caught.
- **System binaries by absolute path.** Bare names in `--allow-run` resolve through `PATH`, where another
  directory could shadow `codesign` or `tar`. Every command now runs as `/usr/bin/<name>`, and
  `lint:security` rejects an `--allow-run` entry that is not an absolute path.
- **TypeScript 6 is strict about Web Crypto input:** `crypto.subtle.digest` needs a buffer backed by a
  plain `ArrayBuffer`, so `sha256Hex` copies its input.

## Verification

Commands run on 2026-11-01:

- `deno task lint`: fmt, lint, type-check, 48 tests (48 passed), `lint:docs` and `lint:security` with no
  findings.
- `deno task doctor`: 14 checks, all `ok`. Again with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`:
  all `ok`, with the test library built by the CLT's clang and reported `arm64, Signature=adhoc`. This
  closes the last open toolchain question from the plan.
- **Failure cases:**
  - `BG2EE_BINARY` pointed at a non-game binary: `doctor` exits 1, with the build and entitlement checks
    failing.
  - `BG2EE_WEIDU` pointed at the game folder's v249: a warning naming v249 x86_64 and the Rosetta
    requirement.
- **Installs:**
  - `setup-weidu` and `setup-dev`, from an empty `vendor/`: both downloads matched their checksums and
    installed.
  - A second run of each did nothing.
  - A checksum mismatch writing nothing is covered by a test.

Still to check by hand:

1. Run `deno task doctor` on a Mac without Xcode or the Command Line Tools, to confirm the requirements
   document is complete from nothing.

## Follow-ups

- Phase 0: the injection smoke test, which adds `deno task build` and `deno task play` (`initial/03-injection`).
- `doctor` gains the hotkey-conflict check (the player's keymap in `Baldur.lua`) in Phase 4, when the
  hotkey exists.
