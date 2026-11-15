-- fakegame.lua: a fake game for the Lua tests, as bytes in a Lua table, read through a fake
-- A7X_native the way the real one reads game memory. world() builds a party of two: A on the derived
-- stats block with a custom name and a weapon, B on the temp block with a strref name, no weapon and
-- improved invisibility, both in the area on screen (AR0602), with nothing under the pointer (id -1
-- at the area's picked field). crowd() adds, past the first 256
-- slots, a hostile creature in the same area, a neutral one in another area and an object that is not
-- a sprite. Tests change single fields with field() to make the hostile cases, and make a block read
-- fail by adding its address to F.fail_blocks.

dofile("mod/inspector/lib/a7xoff.lua")
local O = A7XOFF
local F = {}

-- Memory: address -> byte. Unwritten bytes are unmapped, so a read touching one fails.
local mem = {}
local SIZES = { u8 = 1, i8 = 1, u16 = 2, i16 = 2, u32 = 4, i32 = 4, ptr = 8 }

local function put(addr, kind, value)
  local n = SIZES[kind]
  if value < 0 then value = value + 2 ^ (8 * n) end
  for i = 0, n - 1 do
    mem[addr + i] = math.floor(value / 2 ^ (8 * i)) % 256
  end
end

local function get(addr, kind)
  if kind == "cstr" then
    local chars = {}
    for i = 0, 255 do
      local b = mem[addr + i]
      if b == nil then return i > 0 and table.concat(chars) or nil end
      if b == 0 then return table.concat(chars) end
      chars[#chars + 1] = string.char(b)
    end
    return table.concat(chars)
  end
  local n = SIZES[kind]
  if not n then return nil end
  local v = 0
  for i = n - 1, 0, -1 do
    local b = mem[addr + i]
    if b == nil then return nil end
    v = v * 256 + b
  end
  if (kind == "i8" or kind == "i16" or kind == "i32") and v >= 2 ^ (8 * n - 1) then
    v = v - 2 ^ (8 * n)
  end
  return v
end

local function field(base, f, value) put(base + f[1], f[2], value) end
local function cstr(addr, text)
  for i = 1, #text do mem[addr + i - 1] = text:byte(i) end
  mem[addr + #text] = 0
end

local ROOT, GAME, ARRAY = 0x10000, 0x20000, 0x50000
local A, B, C, D, E = 0x100000, 0x200000, 0x500000, 0x510000, 0x520000
local ID_A, ID_B = 5 * 65536 + 2001, 6 * 65536 + 2002
local ID_C, ID_D, ID_E = 300 * 65536 + 2003, 7 * 65536 + 2004, 8 * 65536 + 2005
local AREA1, AREA2 = 0x600000, 0x610000

-- A sprite's .cre resref, NUL-padded.
function F.resref(at, text)
  for i = 0, O.sprite.resref_size - 1 do mem[at + O.sprite.resref + i] = text:byte(i + 1) or 0 end
end

local function stats(block, v)
  for name, f in pairs(O.stats) do put(block + f[1], f[2], v[name] or 0) end
end

local function sprite(at, id, s)
  field(at, O.object.type, s.type or O.sprite_type)
  field(at, O.object.id, id)
  field(at, O.object.ea, s.ea or 2)
  field(at, O.object.area, s.area or AREA1)
  field(at, O.sprite.allow_effect_list, s.allow)
  F.resref(at, s.resref or "")
  field(at, O.sprite.name_strref, s.strref)
  field(at, O.sprite.name, s.name or 0)
  field(at, O.sprite.hp, s.hp)
  for i = 0, 4 do put(at + O.sprite.base_saves[1] + i, "u8", 10 + i) end
  field(at, O.sprite.thac0_bonus, 2)
  field(at, O.sprite.weapon_slot, 3)
  for slot = 0, 10 do put(at + O.sprite.items + 8 * slot, "ptr", 0) end
  if s.item then put(at + O.sprite.items + 8 * 3, "ptr", s.item) end
  stats(at + O.sprite.derived, s.derived)
  stats(at + O.sprite.temp, s.temp)
  field(at, O.sprite.timed_effects, 0) -- empty effect lists
  field(at, O.sprite.equipped_effects, 0)
end

local next_effect = 0x700000

-- Sprite `at`'s `which` effect list ("timed" or "equipped") holding `list`, a table of
-- { opcode, p2, timing, duration, source }: each node holds the next node and its effect
-- (O.effect_node); each effect is laid out as an EFF V2.0 file, a vtable pointer in its first 8
-- bytes, the fields where O.effect has them.
function F.effects(at, which, list)
  local first = 0
  for i = #list, 1, -1 do
    local e, node, effect = list[i], next_effect, next_effect + 0x20
    next_effect = next_effect + 0x200
    field(node, O.effect_node.next, first)
    put(node + 0x8, "ptr", 0) -- the previous node, never followed
    field(node, O.effect_node.effect, effect)
    put(effect, "ptr", 0x1009a0000) -- the vtable
    for off = 0x8, 0x10c, 4 do put(effect + off, "u32", 0) end
    field(effect, O.effect.opcode, e.opcode)
    field(effect, O.effect.p2, e.p2 or 0)
    field(effect, O.effect.timing, e.timing or 0)
    field(effect, O.effect.duration, e.duration or 0)
    field(effect, O.effect.applied, 900)
    local source = e.source or ""
    for k = 1, #source do mem[effect + O.effect.source + k - 1] = source:byte(k) end
    first = node
  end
  field(at, which == "timed" and O.sprite.timed_effects or O.sprite.equipped_effects, first)
end

local function area(at, resref)
  for i = 0, O.area.resref_size - 1 do mem[at + O.area.resref + i] = resref:byte(i + 1) or 0 end
end

local function world()
  mem = {}
  F.fail_blocks = {}
  field(ROOT, O.chitin.game, GAME)
  for i = 0, O.game.area_count - 1 do put(GAME + O.game.areas[1] + 8 * i, "ptr", 0) end
  put(GAME + O.game.areas[1], "ptr", AREA1)
  put(GAME + O.game.areas[1] + 8, "ptr", AREA2)
  field(GAME, O.game.visible_area, 0)
  area(AREA1, "AR0602")
  area(AREA2, "AR0603")
  field(AREA1, O.area.picked, -1) -- nothing under the pointer
  field(AREA2, O.area.picked, -1)
  field(GAME, O.game.party_count, 2)
  put(GAME + O.game.party_ids[1], "i32", ID_A)
  put(GAME + O.game.party_ids[1] + 4, "i32", ID_B)
  field(ARRAY, O.objects.capacity, 100)
  field(ARRAY, O.objects.highest, 10)
  for slot = 0, 10 do
    put(ARRAY + 16 * slot, "u16", O.objects.empty)
    put(ARRAY + 16 * slot + 8, "ptr", 0)
  end
  put(ARRAY + 16 * 5, "u16", 2001)
  put(ARRAY + 16 * 5 + 8, "ptr", A)
  put(ARRAY + 16 * 6, "u16", 2002)
  put(ARRAY + 16 * 6 + 8, "ptr", B)
  cstr(0x300000, "Alarion")
  sprite(A, ID_A, {
    resref = "ALARION", allow = 1, strref = -1, name = 0x300000, hp = 40, item = 0x400000,
    derived = { max_hp = 52, ac = -2, ac_missile = 1, thac0 = 9, save_death = 4, save_spell = 7,
      resist_fire = 25, resist_magic = 10, hit_bonus = 1 },
    temp = { max_hp = 99, ac = 9 },
  })
  sprite(B, ID_B, {
    allow = 0, strref = 1234, hp = 18,
    derived = { save_death = 8, thac0 = 15 },
    temp = { max_hp = 30, ac = 5, save_death = 6, state = O.state_improved_invisibility },
  })
end

-- More objects, so a scan crosses into a second 256-slot block: C, hostile, in the area on screen
-- at slot 300; D, neutral, in the other area; E, not a sprite, in the area on screen.
local function crowd()
  field(ARRAY, O.objects.capacity, 400)
  field(ARRAY, O.objects.highest, 300)
  for slot = 11, 300 do
    put(ARRAY + 16 * slot, "u16", O.objects.empty)
    put(ARRAY + 16 * slot + 8, "ptr", 0)
  end
  local function slot(index, generation, at)
    put(ARRAY + 16 * index, "u16", generation)
    put(ARRAY + 16 * index + 8, "ptr", at)
  end
  slot(300, 2003, C)
  slot(7, 2004, D)
  slot(8, 2005, E)
  sprite(C, ID_C, { resref = "OGRE01", ea = 255, allow = 1, strref = 1235, hp = 60, derived = { max_hp = 60 }, temp = {} })
  sprite(D, ID_D, { ea = 128, area = AREA2, allow = 1, strref = 1236, hp = 8, derived = { max_hp = 8 }, temp = {} })
  field(E, O.object.type, 0x10)
  field(E, O.object.area, AREA1)
end

A7X_native = {
  Version = function() return 2, "2.7.3 arm64" end,
  Root = function() return ROOT end,
  Objects = function() return ARRAY end,
  Read = function(addr, kind) return get(addr, kind) end,
  -- Bytes never written read as zero here: the fake has no unmapped pages, only sparse writes.
  ReadBlock = function(addr, n)
    if F.fail_blocks[addr] then return nil end
    local chars = {}
    for i = 0, n - 1 do chars[#chars + 1] = string.char(mem[addr + i] or 0) end
    return table.concat(chars)
  end,
}
local NAMES = { [1234] = "Jaheira", [1235] = "Ogre", [1236] = "Commoner" }
function Infinity_FetchString(strref) return NAMES[strref] end


F.ROOT, F.GAME, F.ARRAY, F.A, F.B, F.ID_A, F.ID_B = ROOT, GAME, ARRAY, A, B, ID_A, ID_B
F.C, F.D, F.E, F.ID_C, F.ID_D, F.ID_E = C, D, E, ID_C, ID_D, ID_E
F.AREA1, F.AREA2 = AREA1, AREA2
F.fail_blocks = {}
F.put, F.field, F.world, F.crowd = put, field, world, crowd
return F
