-- fakegame.lua: a fake game for the Lua tests, as bytes in a Lua table, read through a fake
-- A7X_native the way the real one reads game memory. world() builds a party of two: A on the derived
-- stats block with a custom name and a weapon, B on the temp block with a strref name, no weapon and
-- improved invisibility. Tests change single fields with field() to make the hostile cases.

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
local A, B = 0x100000, 0x200000
local ID_A, ID_B = 5 * 65536 + 2001, 6 * 65536 + 2002

local function stats(block, v)
  for name, f in pairs(O.stats) do put(block + f[1], f[2], v[name] or 0) end
end

local function sprite(at, id, s)
  field(at, O.object.type, s.type or O.sprite_type)
  field(at, O.object.id, id)
  field(at, O.object.ea_a, 2)
  field(at, O.object.ea_b, 2)
  field(at, O.sprite.allow_effect_list, s.allow)
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
end

local function world()
  mem = {}
  field(ROOT, O.chitin.game, GAME)
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
    allow = 1, strref = -1, name = 0x300000, hp = 40, item = 0x400000,
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

A7X_native = {
  Root = function() return ROOT end,
  Objects = function() return ARRAY end,
  Read = function(addr, kind) return get(addr, kind) end,
}
function Infinity_FetchString(strref) return strref == 1234 and "Jaheira" or nil end


F.ROOT, F.GAME, F.ARRAY, F.A, F.B, F.ID_A, F.ID_B = ROOT, GAME, ARRAY, A, B, ID_A, ID_B
F.put, F.field, F.world = put, field, world
return F
