# TODO

Open tasks as of 2026-11-01. A task is deleted when done; its outcome goes in the delivery note that
covers it.

## Compatibility

- **Compatibility with other mods: untested.** Everything so far is tested only on a clean, unmodded
  2.7.3 install. Risks to check:
  - Mods that rewrite `ui.menu` (UI mods, iwdification) can remove the inspector's patch, so install
    order matters.
  - Mods that change spell files (SCS/Stratagems, Ascension, iwdification) change names and effects; the
    generated spell-name table must be regenerated after mod changes.
  - The BG2EE-GameLog tap should coexist in the same `ui.menu`.
  - The engine mounts every `*.zip` in the game folder, its `dlc/` folder and the user folder at startup
    (see the Phase 0 delivery note). A DLC-style zip, one with its own `mod.key`, supplies resources the
    engine uses. Check whether the spell-name lookup must read them too.
- **Security implications of mounted zips: unchecked.** Any zip dropped into those three folders is
  read by the game at every launch, including stray mod downloads. Check what such a zip can change
  (overrides, scripts, `ui.menu`, Lua), whether that reaches the inspector's Lua or the data it prints,
  and whether `doctor` should list the zips it finds. Record the result in `docs/rules/security-first.md`
  or a delivery note.
  - Method: test with iwdification, Ascension and Stratagems, then record results in
    `docs/requirements.md` and a delivery note.
- **Clean-machine install: untested.** Confirm `docs/requirements.md` is complete on a Mac or user
  account without Xcode or the Command Line Tools.

## Later

- **UI panel: a separate external mod, not part of this project.** A world-screen `menu` in its own repo,
  built only on the public `A7X` API (`docs/api.md`, Phase 4) and declared with
  `REQUIRE_PREDICATE MOD_IS_INSTALLED`. `examples/consumer-mod/` is its starting point.
- **Launching without Deno.** Test Steam launch options (`DYLD_INSERT_LIBRARIES=<path> %command%`) and a
  small `.command` launcher. Prebuilt, ad-hoc-signed releases would also remove the Command Line Tools
  requirement for players.
