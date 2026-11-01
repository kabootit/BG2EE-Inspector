# Security first

**This project must not compromise the machine it runs on, the game, or the player's saves. Default-deny
everywhere; the native library stays read-only.**

**Why:** the project loads native code into a signed game process, patches the game's UI, executes an
external installer, downloads files, and captures what the game prints. Each of those is a path to harm
if it grows a convenience grant. BG2EE-GameLog's audit found and closed exactly that kind of gap.

## How to apply

- **Scoped Deno permissions.** Every `--allow-*` flag names its paths, hosts or binaries (`--allow-read=.`,
  `--allow-run=ditto`); never bare, never `-A`. `lint:security` checks every task.
- **The native library is read-only.**
  - Reads go through `mach_vm_read_overwrite`, so a bad pointer returns an error instead of crashing.
  - No memory-write call (`mach_vm_write`, `vm_protect` and similar) and no access to other processes.
  - `mprotect` appears exactly once, at the marked `luaL_Reg` pointer swap (ADR-0002).
  - `lint:security` checks `native/` for all of this.
- **Raw reads stay private.** The native functions are hidden from other mods once the inspector loads;
  external mods get only the public data API (Phase 4).
- **Fail closed.** An unknown game build, or any address whose expected bytes do not match, disables the
  inspector rather than guessing.
- **Bind loopback only** for any local server, and **redact** the Steam account id and home paths at the
  point of capture, never as a cleanup pass.
- **Ask before executing anything not shipped here.** Downloaded files are checked against a pinned
  SHA-256 before use, and nothing is installed without asking (see [toolchain.md](toolchain.md)).
- **Licensing.** Code, headers and data files from EEex and InfinityLoader are never copied, vendored or
  generated from: those repos have no license. Offsets are derived independently and the sources
  credited. MIT sources such as BG2RadarOverlay may be adapted with attribution.
- **Say when something is advisory.** The committed deny list in `.claude/settings.json` matches command
  prefixes and is a backstop, not a sandbox; the written rules are the control.
- **Run the checks.** `deno task lint:security` after any change to code, tasks or settings, and the
  `security-audit` skill for the judgment half: before installing anything into the game and before
  publishing.

Related: [toolchain.md](toolchain.md), [git.md](git.md).
