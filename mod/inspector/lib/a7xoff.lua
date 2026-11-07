-- a7xoff.lua: engine offsets for BG2:EE 2.7.3 arm64, by name.
--
-- Numbers only; the walker (a7xwalk.lua) reads every field through this table, so a new game build
-- means a new copy of this file and nothing else in the Lua. Each field is { offset, kind }, with
-- kind as A7X_native.Read takes it. Where each value comes from: docs/re-notes.md, "Engine
-- structures". The file name is at most 8 characters, the limit for Infinity_DoFile.

A7XOFF = {
  build = "2.7.3 arm64",

  -- From A7X_native.Root(): the CBaldurChitin object.
  chitin = { game = { 0x10c0, "ptr" } },

  -- CInfGame: the party, as object ids in slot order.
  game = {
    party_ids = { 0x6618, "i32" },
    party_count = { 0x6630, "i16" },
    party_max = 6,
  },

  -- The object array at A7X_native.Objects(): 16-byte slots, its bounds in the 16 bytes before it.
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
    -- Two CAIObjectType EA bytes; which is live is settled by the party check (party members read 2).
    ea_a = { 0x30, "u8" },
    ea_b = { 0x78, "u8" },
  },
  sprite_type = 0x31,

  -- CGameSprite.
  sprite = {
    allow_effect_list = { 0x4e8c, "i32" }, -- non-zero: derived is the current stats block
    derived = 0x1120,
    temp = 0x1dc0,
    name_strref = { 0x560, "i32" },
    name = { 0x3910, "ptr" }, -- a char*, used when the strref is -1
    hp = { 0x57c, "i16" },
    base_saves = { 0x5ac, "u8" }, -- five bytes, death to spell
    thac0_bonus = { 0x1204, "i32" },
    weapon_slot = { 0x10f8, "u8" },
    items = 0xfc0, -- item pointers, 8 bytes each, indexed by the weapon slot
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
}
