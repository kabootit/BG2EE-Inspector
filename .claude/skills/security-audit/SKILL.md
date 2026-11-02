---
name: security-audit
description: Run a security audit of BG2EE-Inspector. Use before installing the dylib or the WeiDU component into the game, before publishing or pushing, and after any change to native/, deno.json permissions, the launcher, anything that downloads or executes a binary, a capture path, or .claude/settings.json.
---

# Security audit

The standing rule is in [docs/rules/security-first.md](../../../docs/rules/security-first.md): the project
must not compromise the machine, the game, or the player's saves. `deno task lint:security` enforces the
mechanical invariants; this is the half that needs judgment. Adapted from BG2EE-GameLog's audit
procedure.

## Step 1: mechanical checks

```sh
deno task lint
```

This includes `lint:security`:

- dependencies and the import map;
- scoped permissions;
- loopback binding;
- the read-only native library;
- the Claude Code deny and ask lists;
- AI attribution lines;
- home paths in code;
- test location.

Fix any failure first. **Passing is necessary, not sufficient**: every check is a pattern, and patterns
only catch what someone already thought of. When adding a check, make it fail on purpose once, then
restore.

## Step 2: judgment checks

### The native library

- Read every change to `native/`. Is there any way to write memory, change page protections at all,
  interpose a function outside `ALLOWED_INTERPOSE`, start threads, open files or sockets, or reach
  another process? Any of these is a design change for an ADR, not an implementation detail.
- Does the interposed replacement always call the real function, on every path, including an unknown
  build?
- Does every read go through `mach_vm_read_overwrite`? A raw pointer dereference can crash the game.
- Does an unknown build, or a failed byte check, register nothing? Test it by flipping one expected byte.

### Launch path

- `DYLD_INSERT_LIBRARIES` must point at the dylib this project built, by absolute path, never a directory
  search.
- The launcher passes arguments as an array to `Deno.Command`, never through a shell string.

### Downloads and external binaries

- Every download (WeiDU, Lua source) is checked against a pinned SHA-256 **before** it is unpacked or run,
  and refuses on mismatch.
- `BG2EE_WEIDU` overrides are SHA-checked against the known list and warn when unknown.
- Nothing downloads at game runtime; the dylib and Lua make no network requests.

### Game install and saves

- The WeiDU component keeps its uninstall backup intact and patches only with anchors it has verified as
  unique.
- The e2e runner touches only `A7X-E2E-*` save slots, removes them afterwards, and never saves the game.
  Compare other slots before and after.
- The developer test component is never installed by default.

### Captured output

- Read the non-event lines of a fresh session by eye: account ids, user names, absolute paths, tokens.
  Anything found is redacted at the point of capture, then every committed log is re-scanned.

### Public API

- `A7X_native` is `nil` after load; external mods get only the data API.
- Every API call returns fresh tables; no inspector state is mutable from outside.

### Licensing

- Nothing copied from EEex or InfinityLoader (no license): no code, headers or `.db` files. Offsets are
  derived independently. MIT sources carry attribution.

### Before publishing

- Check history, not just the working tree, for home paths, emails and account ids.
- Confirm no AI attribution in any commit message.

## Reporting

For each finding: what it is, why it matters, a concrete failure scenario, and the fix. Label findings
**confirmed** or **latent**. Zero findings is a valid result.

## Accepted risks

- The `.claude/settings.json` deny list matches command prefixes and is advisory; the written rules are
  the control.
- WeiDU is trusted once its SHA-256 matches the pinned release. It is not sandboxed and writes to the
  game folder by design.
- A bug in the inspector's Lua can raise a `LUA ERROR` in the game UI. A bug in the dylib can crash the
  game process. Saves are never written by the inspector.
