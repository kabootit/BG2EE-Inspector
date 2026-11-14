-- a7xwalk.lua: follow engine structures from A7X_native.Root() to the party and to the creatures in
-- the area on screen, and read a creature.
--
-- Every read goes through A7X_native (read-only, a bad address gives nil) and every field through
-- A7XOFF (a7xoff.lua), so this file holds no numbers of its own. Before a pointer is followed it
-- must look like one; before a sprite is read its type must be a sprite's. Each function returns
-- nil and a reason instead of raising, so a caller in the game's UI never sees a Lua error from
-- here. A7X_native is looked up on each call: it may be registered after this file loads.

A7XWALK = {}

local O = A7XOFF
local POINTER_LIMIT = 2 ^ 47 -- user space on arm64 macOS; also rules out -1 read as unsigned

local function native()
  return type(A7X_native) == "table" and A7X_native or nil
end

local function valid_pointer(p)
  return type(p) == "number" and p >= 0x1000 and p < POINTER_LIMIT and p % 1 == 0
end
A7XWALK.valid_pointer = valid_pointer

-- Read `field` ({ offset, kind }) at `base`; nil for a bad base or a failed read.
local function R(base, field)
  local N = native()
  if not N or not valid_pointer(base) then return nil end
  return N.Read(base + field[1], field[2])
end
A7XWALK.read = R

-- The sprite for an object id, through the object array; nil and a reason otherwise.
function A7XWALK.lookup(id)
  local N = native()
  if not N then return nil, "no A7X_native" end
  if type(id) ~= "number" or id < 0 or id % 1 ~= 0 then return nil, "bad id" end
  local array = N.Objects()
  local capacity, highest = R(array, O.objects.capacity), R(array, O.objects.highest)
  if not capacity or not highest then return nil, "object array unreadable" end
  local index, generation = math.floor(id / 65536) % 32768, id % 65536
  if index > highest or index >= capacity then return nil, "id outside the array" end
  local slot = array + index * O.objects.slot_size
  if R(slot, O.objects.generation) ~= generation then return nil, "stale id" end
  local object = R(slot, O.objects.pointer)
  if not valid_pointer(object) then return nil, "empty slot" end
  return object
end

-- The party: { { slot, id, sprite } ... } in portrait order, or nil and a reason.
function A7XWALK.party()
  local N = native()
  if not N then return nil, "no A7X_native" end
  local game = R(N.Root(), O.chitin.game)
  if not valid_pointer(game) then return nil, "no game loaded" end
  local count = R(game, O.game.party_count)
  if not count or count < 0 or count > O.game.party_max then return nil, "bad party count" end
  local party = {}
  for slot = 0, count - 1 do
    local id = R(game, { O.game.party_ids[1] + 4 * slot, O.game.party_ids[2] })
    local sprite, why = A7XWALK.lookup(id)
    party[#party + 1] = { slot = slot, id = id, sprite = sprite, why = why }
  end
  return party
end

-- `n` bytes of `block` from position `at` (0-based) as a little-endian unsigned number.
local function unsigned(block, at, n)
  local v = 0
  for i = n, 1, -1 do v = v * 256 + block:byte(at + i) end
  return v
end

-- The area on screen: { index, pointer, resref }, or nil and a reason.
function A7XWALK.visible_area()
  local N = native()
  if not N then return nil, "no A7X_native" end
  local game = R(N.Root(), O.chitin.game)
  if not valid_pointer(game) then return nil, "no game loaded" end
  local index = R(game, O.game.visible_area)
  if not index or index >= O.game.area_count then return nil, "bad visible area index" end
  local area = R(game, { O.game.areas[1] + 8 * index, O.game.areas[2] })
  if not valid_pointer(area) then return nil, "no visible area" end
  local block = N.ReadBlock(area + O.area.resref, O.area.resref_size)
  if not block then return nil, "area unreadable" end
  return { index = index, pointer = area, resref = block:match("^[^\0]*") }
end

-- Every sprite in `area` (a CGameArea pointer), in object-array order, as { id, sprite, ea }, and
-- the scan's counts { slots, objects, sprites }; or nil and a reason. The slots are read 256 at a
-- time (4 KB, ReadBlock's limit), never past the highest slot in use or the array's capacity.
function A7XWALK.creatures(area)
  local N = native()
  if not N then return nil, "no A7X_native" end
  if not valid_pointer(area) then return nil, "bad area pointer" end
  local array = N.Objects()
  local capacity, highest = R(array, O.objects.capacity), R(array, O.objects.highest)
  if not capacity or not highest then return nil, "object array unreadable" end
  local slots = math.max(0, math.min(highest + 1, capacity))
  local size, per = O.objects.slot_size, 256
  local list, counts = {}, { slots = slots, objects = 0, sprites = 0 }
  for first = 0, slots - 1, per do
    local n = math.min(per, slots - first)
    local block = N.ReadBlock(array + first * size, n * size)
    if not block then return nil, "object array unreadable at slot " .. first end
    for i = 0, n - 1 do
      -- A slot: a u16 generation and an 8-byte pointer (O.objects.generation, O.objects.pointer).
      local generation = unsigned(block, i * size + O.objects.generation[1], 2)
      local object = unsigned(block, i * size + O.objects.pointer[1], 8)
      if generation ~= O.objects.empty and valid_pointer(object) then
        counts.objects = counts.objects + 1
        if R(object, O.object.type) == O.sprite_type then
          counts.sprites = counts.sprites + 1
          if R(object, O.object.area) == area then
            list[#list + 1] = { id = R(object, O.object.id), sprite = object, ea = R(object, O.object.ea) }
          end
        end
      end
    end
  end
  return list, counts
end

-- "friendly", "neutral" or "hostile" for an EA value, by the engine's two cut-offs; nil for no EA.
function A7XWALK.ea_group(ea)
  if type(ea) ~= "number" then return nil end
  if ea <= O.ea.friendly_max then return "friendly" end
  if ea >= O.ea.hostile_min then return "hostile" end
  return "neutral"
end

local function stat(block, name)
  return R(block, O.stats[name])
end

-- The name the record screen shows: the strref's text, or the engine string for a custom name.
local function name_of(sprite)
  local strref = R(sprite, O.sprite.name_strref)
  if strref and strref ~= -1 then
    return type(Infinity_FetchString) == "function" and Infinity_FetchString(strref) or nil
  end
  local text = R(sprite, O.sprite.name)
  return valid_pointer(text) and native().Read(text, "cstr") or nil
end

-- THAC0 as the record screen shows it: the derived THAC0 less the weapon bonus and HITBONUS, or 0
-- with no item in the selected weapon slot.
local function thac0_shown(sprite, derived, current)
  local slot = R(sprite, O.sprite.weapon_slot)
  local item = slot and R(sprite, { O.sprite.items + 8 * slot, "ptr" })
  if not item or item == 0 then return 0 end
  local thac0, bonus, hit = stat(derived, "thac0"), R(sprite, O.sprite.thac0_bonus), stat(current, "hit_bonus")
  if not (thac0 and bonus and hit) then return nil end
  return thac0 - bonus - hit
end

local SAVES = { "death", "wand", "poly", "breath", "spell" }
local RESISTS = {
  "fire", "cold", "electricity", "acid", "magic_fire", "magic_cold",
  "slashing", "crushing", "piercing", "missile",
}

-- A creature's record from its sprite, or nil and a reason. Stats come from the current stats
-- block (derived unless the engine is mid-update, as EEex reads them); the *_shown fields mirror
-- what the record screen computes, for comparison with characters[].
function A7XWALK.creature(sprite)
  if not valid_pointer(sprite) then return nil, "bad sprite pointer" end
  if R(sprite, O.object.type) ~= O.sprite_type then return nil, "not a sprite" end
  local allow = R(sprite, O.sprite.allow_effect_list)
  if allow == nil then return nil, "sprite unreadable" end
  local derived = sprite + O.sprite.derived
  local current = allow ~= 0 and derived or sprite + O.sprite.temp
  local c = {
    id = R(sprite, O.object.id),
    name = name_of(sprite),
    ea = R(sprite, O.object.ea),
    stats_block = allow ~= 0 and "derived" or "temp",
    state = stat(current, "state"),
    hp = { cur = R(sprite, O.sprite.hp), max = stat(current, "max_hp") },
    ac = {
      value = stat(current, "ac"),
      crushing = stat(current, "ac_crushing"),
      missile = stat(current, "ac_missile"),
      piercing = stat(current, "ac_piercing"),
      slashing = stat(current, "ac_slashing"),
    },
    thac0 = stat(current, "thac0"),
    thac0_shown = thac0_shown(sprite, derived, current),
    saves = {},
    saves_base = {},
    saves_shown = {},
    resist = {},
    mr = stat(current, "resist_magic"),
  }
  local invisible = c.state and math.floor(c.state / O.state_improved_invisibility) % 2 == 1
  for i, save in ipairs(SAVES) do
    c.saves[save] = stat(current, "save_" .. save)
    c.saves_base[save] = R(sprite, { O.sprite.base_saves[1] + i - 1, O.sprite.base_saves[2] })
    local d = stat(derived, "save_" .. save)
    c.saves_shown[save] = d and (invisible and d - 4 or d)
  end
  for _, r in ipairs(RESISTS) do c.resist[r] = stat(current, "resist_" .. r) end
  return c
end

A7XWALK.SAVES = SAVES
A7XWALK.RESISTS = RESISTS
