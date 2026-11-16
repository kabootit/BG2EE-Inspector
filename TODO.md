# TODO

Open tasks as of 2026-11-01. Delete a task when done; its outcome goes in the delivery note that
covers it.

## Compatibility

- **Compatibility with other mods: untested.** All testing so far ran only on a clean, unmodded
  2.7.3 install. Risks to check:
  - Mods that rewrite `ui.menu` (UI mods, iwdification) can remove the inspector's patch, so install
    order matters.
  - Mods that change spell files (SCS/Stratagems, Ascension, iwdification) change names and effects, so
    rebuild the generated spell-name table after mod changes.
  - The BG2EE-GameLog tap should coexist in the same `ui.menu`: both patches leave the line they
    anchor on (`combatLog = {}`) in place, so either may install first, but no run has tried either
    order.
  - The engine mounts every `*.zip` in the game folder, its `dlc/` folder and the user folder at startup
    (see the Phase 0 delivery note). A DLC-style zip, one with its own `mod.key`, supplies resources the
    engine uses. Check whether the spell-name lookup must read them too.
- **Security implications of mounted zips: unchecked.** The game reads any zip dropped into those
  three folders at every launch, including stray mod downloads. Check what such a zip can change
  (overrides, scripts, `ui.menu`, Lua), whether that reaches the inspector's Lua or the data it prints,
  and whether `doctor` should list the zips it finds. Record the result in `docs/rules/security-first.md`
  or a delivery note.
  - Method: test with iwdification, Ascension and Stratagems, then record results in
    `docs/requirements.md` and a delivery note.
- **Clean-machine install: untested.** Confirm `docs/requirements.md` is complete on a Mac or user
  account without Xcode or the Command Line Tools.

## Later

- **Phase 4, in three parts** ([plan](docs/plans/2026-11-14-data-api.md)): the data API and console
  output (done on 2026-11-14, [delivery note](docs/notes/2026-11-14-data-api.md)), then the hotkey and the
  WeiDU install (done on 2026-11-15, [delivery note](docs/notes/2026-11-14-hotkey-install.md)); the
  third part, `examples/consumer-mod/`, moved to after Phase 5 (below).
- **Phase 5, in three parts:** finding and proving the effect list (done on 2026-11-15,
  [delivery note](docs/notes/2026-11-15-effect-list.md)), then time remaining and its duration gate
  (done on 2026-11-15, [delivery note](docs/notes/2026-11-15-time-remaining.md)), then the output:
  spell names, `A7X.show` and the record's `effects` (done on 2026-11-15,
  [delivery note](docs/notes/2026-11-15-spell-output.md)). Left over: a name for the bard song's
  `FJBARDB`, which no spell file gives.
- **`examples/consumer-mod/`, after Phase 5.** Moved on 2026-11-15: it needs its own design, not
  the 30-line example the foundation plan assumed. What research found so far, to start from:
  - **Lua loads without a `ui.menu` patch.** "The v2.2 update adds native support for M_*.lua files.
    Drop any .lua file with a prefix of M_ into override, and the engine will load it just like
    BGEE.lua" (Beamdog, <https://forums.beamdog.com/discussion/57210>); EEex installs
    `M___EEex.lua`. The same post says it "only lets you make changes to BGEE.lua, not UI.menu", so
    a check in the game must show whether `A7X` loaded this way is visible to `ui.menu`'s Lua. If it
    is, the inspector itself could drop its `Infinity_DoFile` patch and one anchor.
  - **Established mods patch `ui.menu` by menu name**, through libraries: SFO's `lib_ui.tph` (used by
    Stratagems and iwdification) pulls a named `menu` out, patches it and puts it back; Mods Options
    uses `ACuimenulib.tph`; Infinity UI++ replaces the whole file, and mods that patch `ui.menu` may
    not work with it. Others install after the overhauls they name.
  - **There is no timer callback in the base game**, only polling from a drawn element's `text lua`;
    an element in the action bar likely stops ticking while the game hides the bar (cutscenes, dialogue).
    SFO hooks menus' `onOpen` instead.
  - **The dependency line works as planned**, `REQUIRE_PREDICATE MOD_IS_INSTALLED
    ~inspector/inspector.tp2~ ~0~`, as iwdification's own lines do; current practice (EEex)
    references a component `LABEL` through `ID_OF_LABEL`, which the inspector's tp2 would need.
- **`deno task check-mod`:** run the pinned WeiDU on a scratch copy of the game folder, install and
  uninstall, so a tp2 WeiDU cannot parse fails before a manual test (the first Hotkey and install
  run).

- **`deno task derive`: deferred until a second build.** Hand edits maintain `native/builds.h`, and
  `test/re/builds_test.ts` checks it; `docs/re-notes.md` has the recipe for a new build. Automating
  the recipe in `src/re/` is worth it once a game update gives it something to derive.

- **UI panel: a separate external mod, not part of this project.** A world-screen `menu` in its own repo,
  built only on the public `A7X` API (`docs/api.md`, Phase 4) and declared with
  `REQUIRE_PREDICATE MOD_IS_INSTALLED`. `examples/consumer-mod/` is its starting point, and the
  research above applies to it.
- **Launching without Deno.** Test Steam launch options (`DYLD_INSERT_LIBRARIES=<path> %command%`) and a
  small `.command` launcher. Prebuilt, ad-hoc-signed releases would also remove the Command Line Tools
  requirement for players.
