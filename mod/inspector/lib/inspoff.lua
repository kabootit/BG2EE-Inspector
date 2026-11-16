-- inspoff.lua: engine offsets for BG2:EE 2.7.3 arm64, by name.
--
-- Numbers only; the walker (inspwalk.lua) reads every field through this table, so a new game build
-- means a new copy of this file and nothing else in the Lua. Each field is { offset, kind }, with
-- kind as Inspector_native.Read takes it. Where each value comes from: docs/re-notes.md, "Engine
-- structures". The file name is at most 8 characters, the limit for Infinity_DoFile.

INSPECTOR_OFF = {
  build = "2.7.3 arm64",

  -- From Inspector_native.Root(): the CBaldurChitin object.
  chitin = { game = { 0x10c0, "ptr" } },

  -- CInfGame: the party, as object ids in slot order, and the loaded areas.
  game = {
    party_ids = { 0x6618, "i32" },
    party_count = { 0x6630, "i16" },
    party_max = 6,
    areas = { 0x6598, "ptr" }, -- CGameArea pointers, 8 bytes each; empty slots are 0
    area_count = 12,
    visible_area = { 0x6590, "u8" }, -- index into areas of the area on screen
    -- The game's clock, in the unit of an absolute effect's expiry: what Infinity_GetGameTicks
    -- multiplies (deno task re game-clock); it stands still while paused (Effect duration test).
    time = { 0x3fa0, "u32" },
  },

  -- CGameArea.
  area = {
    resref = 0x204, -- 8 bytes, NUL-padded: the area's resource name, such as AR0602
    resref_size = 8,
    -- The id of the object under the pointer, below 0 for none. Found by tally (deno task re
    -- id-fields), confirmed by the Under the pointer test.
    picked = { 0x244, "i32" },
  },

  -- The object array at Inspector_native.Objects(): 16-byte slots, its bounds in the 16 bytes before it.
  objects = {
    slot_size = 16,
    generation = { 0x0, "u16" },
    pointer = { 0x8, "ptr" },
    empty = 0xffff,
    capacity = { -0x10, "i16" },
    highest = { -0x0e, "i16" },
  },

  -- Any game object.
  object = {
    type = { 0x8, "u8" },
    id = { 0x48, "i32" },
    -- The live EA: the EA byte of the CAIObjectType at +0x30. Found by the party check: the only
    -- offset in the first 2 KB of every party sprite that reads 2 (PC).
    ea = { 0x38, "u8" },
    area = { 0x18, "ptr" }, -- the CGameArea the object is in
  },
  sprite_type = 0x31,

  -- CGameSprite.
  sprite = {
    allow_effect_list = { 0x4e8c, "i32" }, -- non-zero: derived is the current stats block
    resref = 0x540, -- 8 bytes, NUL-padded: the .cre file the creature was made from
    resref_size = 8,
    cre = 0x558, -- the .cre header, as in the file from offset 0 (CRE V1.0)
    cre_size = 0x2d4,
    derived = 0x1120,
    temp = 0x1dc0,
    name_strref = { 0x560, "i32" },
    name = { 0x3910, "ptr" }, -- a char*, used when the strref is -1
    hp = { 0x57c, "i16" },
    base_saves = { 0x5ac, "u8" }, -- five bytes, death to spell
    thac0_bonus = { 0x1204, "i32" },
    weapon_slot = { 0x10f8, "u8" },
    items = 0xfc0, -- item pointers, 8 bytes each, indexed by the weapon slot
    -- The heads of the two effect lists (re effect-lists, confirmed by the effect probe):
    timed_effects = { 0x49f0, "ptr" }, -- spells and abilities
    equipped_effects = { 0x49a0, "ptr" }, -- the items worn
  },

  -- A node of an effect list: the next node, and the effect it holds.
  effect_node = { next = { 0x0, "ptr" }, effect = { 0x10, "ptr" }, max = 256 },

  -- An effect (CGameEffect), laid out as an EFF V2.0 file (IESDP) with its vtable pointer first.
  effect = {
    opcode = { 0x10, "u32" },
    p1 = { 0x1c, "i32" },
    p2 = { 0x20, "i32" }, -- for opcode 142, the status icon
    timing = { 0x24, "u16" }, -- 4096: duration is an absolute expiry time
    duration = { 0x28, "u32" },
    applied = { 0x6c, "u32" },
    source = 0x94, -- 8 bytes, NUL-padded: the spell or item that applied it
    source_size = 8,
    absolute = 4096, -- the timing mode whose duration is an expiry on game.time
    -- Game ticks in a second of game time: a spell file's duration in seconds, times this, is
    -- expiry minus applied (Effect duration test).
    ticks_per_second = 15,
  },

  -- Fields of a stats block (CDerivedStats), by STATS.IDS name and number.
  stats = {
    state = { 0x0, "i32" },
    max_hp = { 0x04, "i16", id = 1 },
    ac = { 0x06, "i16", id = 2 },
    ac_crushing = { 0x08, "i16", id = 3 },
    ac_missile = { 0x0a, "i16", id = 4 },
    ac_piercing = { 0x0c, "i16", id = 5 },
    ac_slashing = { 0x0e, "i16", id = 6 },
    thac0 = { 0x10, "i16", id = 7 },
    save_death = { 0x14, "i16", id = 9 },
    save_wand = { 0x16, "i16", id = 10 },
    save_poly = { 0x18, "i16", id = 11 },
    save_breath = { 0x1a, "i16", id = 12 },
    save_spell = { 0x1c, "i16", id = 13 },
    resist_fire = { 0x1e, "i16", id = 14 },
    resist_cold = { 0x20, "i16", id = 15 },
    resist_electricity = { 0x22, "i16", id = 16 },
    resist_acid = { 0x24, "i16", id = 17 },
    resist_magic = { 0x26, "i16", id = 18 }, -- magic resistance
    resist_magic_fire = { 0x28, "i16", id = 19 },
    resist_magic_cold = { 0x2a, "i16", id = 20 },
    resist_slashing = { 0x2c, "i16", id = 21 },
    resist_crushing = { 0x2e, "i16", id = 22 },
    resist_piercing = { 0x30, "i16", id = 23 },
    resist_missile = { 0x32, "i16", id = 24 },
    hit_bonus = { 0x1f4, "i16", id = 151 }, -- HITBONUS, subtracted from THAC0 as shown
  },
  state_improved_invisibility = 0x400000, -- the record screen shows saves 4 better under it

  -- EA groups, as the engine's own EA matching draws them (EA.IDS GOODCUTOFF and EVILCUTOFF).
  ea = { friendly_max = 30, hostile_min = 200 },
}
