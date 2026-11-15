-- a7xwalk.lua: follow engine structures from A7X_native.Root() to the party, to the creatures in
-- the area on screen and to the one under the pointer, and read a creature, its effects and the
-- game's clock.
--
-- Every read goes through A7X_native (read-only, a bad address gives nil) and every field through
-- A7XOFF (a7xoff.lua), so this file holds no numbers of its own. Before a pointer is followed it
-- must look like one; before a sprite is read its type must be a sprite's. Each function returns
-- nil and a reason instead of raising, so a caller in the game's UI never sees a Lua error from
-- here. The native table is looked up on each call, it may be registered after this file loads:
-- from the provider given to A7XWALK.use (the API's, which keeps the table private), else the global
-- A7X_native. Functions call each other through the local W, so the API may clear the global.

local W = {}
A7XWALK = W

local O = A7XOFF
local provider
local POINTER_LIMIT = 2 ^ 47 -- user space on arm64 macOS; also rules out -1 read as unsigned

local function native()
  local N
  if provider then N = provider() else N = A7X_native end
  return type(N) == "table" and N or nil
end

-- Take the native table from `fn` from now on, instead of the global A7X_native.
function W.use(fn) provider = fn end

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
    local sprite, why = W.lookup(id)
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

-- A NUL-padded resref of `size` bytes at `addr`, cut at the first NUL; nil when unreadable.
function A7XWALK.resref(addr, size)
  local N = native()
  local block = N and valid_pointer(addr) and N.ReadBlock(addr, size)
  return block and block:match("^[^\0]*") or nil
end

-- The game's clock (CInfGame time), or nil and a reason.
function A7XWALK.game_time()
  local N = native()
  if not N then return nil, "no A7X_native" end
  local game = R(N.Root(), O.chitin.game)
  if not valid_pointer(game) then return nil, "no game loaded" end
  local time = R(game, O.game.time)
  if not time then return nil, "clock unreadable" end
  return time
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
  local resref = W.resref(area + O.area.resref, O.area.resref_size)
  if not resref then return nil, "area unreadable" end
  return { index = index, pointer = area, resref = resref }
end

-- The sprite under the pointer in the area on screen, or nil and a reason: nothing there (an id
-- below 0), an id the object array no longer holds, or an object that is not a creature (doors,
-- containers and regions are objects too).
function A7XWALK.picked()
  local area, why = W.visible_area()
  if not area then return nil, why end
  local id = R(area.pointer, O.area.picked)
  if id == nil then return nil, "area unreadable" end
  if id < 0 then return nil, "nothing under the pointer" end
  local object, lost = W.lookup(id)
  if not object then return nil, lost end
  if R(object, O.object.type) ~= O.sprite_type then return nil, "not a creature" end
  return object
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

local EFFECT_LISTS = { timed = O.sprite.timed_effects, equipped = O.sprite.equipped_effects }

-- One of a sprite's effect lists, "timed" (spells and abilities) or "equipped" (the items worn): its
-- effects in list order, each { opcode, p1, p2, timing, duration, applied, source }; or nil and a
-- reason. The walk follows each node's next pointer to a null one, checking every pointer first,
-- and gives up past O.effect_node.max nodes, so a broken or circular list ends with a reason.
function A7XWALK.effects(sprite, which)
  local head = EFFECT_LISTS[which]
  if not head then return nil, "no such list: " .. tostring(which) end
  if not valid_pointer(sprite) then return nil, "bad sprite pointer" end
  if R(sprite, O.object.type) ~= O.sprite_type then return nil, "not a sprite" end
  local node = R(sprite, head)
  if node == nil then return nil, "list unreadable" end
  local out, E = {}, O.effect
  while node ~= 0 do
    if #out >= O.effect_node.max then return nil, "more than " .. O.effect_node.max .. " effects" end
    if not valid_pointer(node) then return nil, "bad node pointer" end
    local at = R(node, O.effect_node.effect)
    if not valid_pointer(at) then return nil, "bad effect pointer" end
    out[#out + 1] = {
      opcode = R(at, E.opcode), p1 = R(at, E.p1), p2 = R(at, E.p2), timing = R(at, E.timing),
      duration = R(at, E.duration), applied = R(at, E.applied),
      source = W.resref(at + E.source, E.source_size),
    }
    node = R(node, O.effect_node.next)
    if node == nil then return nil, "list unreadable" end
  end
  return out
end

-- The game ticks left before effect `e` (from A7XWALK.effects) expires at clock `now`
-- (A7XWALK.game_time()), never below 0; nil for an effect with no expiry (any timing mode but
-- O.effect.absolute: permanent and equipped effects have no countdown). The engine may list an
-- effect a tick or so past its expiry, since it removes expired effects creature by creature.
function A7XWALK.remaining(e, now)
  if e.timing ~= O.effect.absolute or not e.duration or not now then return nil end
  return math.max(e.duration - now, 0)
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
    resref = W.resref(sprite + O.sprite.resref, O.sprite.resref_size),
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
