-- inspapi.lua: the inspector's public API, the global I (docs/api.md), API 2.0, records of schema 1
-- (docs/data-model.md).
--
-- Loaded last by insp.lua. It keeps the other inspector files' tables as locals and clears their
-- globals, so I is the only global the inspector leaves. That includes INSPECTOR_NAMES, the names table
-- the WeiDU component loads before inspector (inspname.lua, written by deno task install-mod); without it
-- a spell shows its resref. The native table is captured the first time a call finds Inspector_native,
-- and that global is cleared too, so no other Lua can make raw memory reads; lazily, because this
-- file may load before the library registers the table. Every call returns fresh tables and none
-- raises: a failure is nil and a reason.

local O, W, J, F, NAMES = INSPECTOR_OFF, INSPECTOR_WALK, INSPECTOR_JSON, INSPECTOR_FMT, INSPECTOR_NAMES
INSPECTOR_OFF, INSPECTOR_WALK, INSPECTOR_JSON, INSPECTOR_FMT, INSPECTOR_NAMES = nil, nil, nil, nil, nil

local API, SCHEMA = "2.0", 1

local N
local function native()
  if not N and type(Inspector_native) == "table" then
    N = Inspector_native
    Inspector_native = nil
  end
  return N
end
if W then W.use(native) end

-- fn's results, or nil and the error if it raised.
local function guarded(fn, ...)
  local ok, a, b = pcall(fn, ...)
  if not ok then return nil, "error: " .. tostring(a) end
  return a, b
end

-- "ok" and the area on screen, or the status: "no_native" or "loading".
local function state()
  if not (O and W and J and F) then return "no_native" end
  if not native() then return "no_native" end
  local area = W.visible_area()
  if not area then return "loading" end
  return "ok", area
end

local SIDES = { friendly = "ally", neutral = "neutral", hostile = "enemy" }

local function party_ids()
  local ids = {}
  for _, m in ipairs(W.party() or {}) do ids[m.id] = true end
  return ids
end

local function allegiance(id, ea, party)
  return { ea = ea, side = party[id] and "party" or SIDES[W.ea_group(ea)] }
end

local function pick(t, keys)
  local out = {}
  for _, k in ipairs(keys) do out[k] = t[k] end
  return out
end

local AC_MODS = { "crushing", "missile", "piercing", "slashing" }
local SAVES = { "death", "wand", "poly", "breath", "spell" }
local RESISTS = {
  "fire", "cold", "electricity", "acid", "magic_fire", "magic_cold",
  "slashing", "crushing", "piercing", "missile",
}

-- A record's fields in order, each with the keys of its table when it is one.
local SHAPE = {
  { "id" }, { "resref" }, { "name" }, { "allegiance", { "ea", "side" } }, { "hp", { "cur", "max" } },
  { "ac" }, { "ac_mods", AC_MODS }, { "thac0" }, { "saves", SAVES }, { "resist", RESISTS }, { "mr" },
}

-- The first field of `r` that could not be read, or nil: a field is never guessed.
local function unreadable(r)
  for _, f in ipairs(SHAPE) do
    local v = r[f[1]]
    if v == nil then return f[1] end
    for _, k in ipairs(f[2] or {}) do
      if v[k] == nil then return f[1] .. "." .. k end
    end
  end
end

-- The name the game shows for a spell or an item, fetched by its strref in the names table, in the
-- game's language; the resref when the table does not have it or the game gives no string.
local function spell_name(resref)
  local strref = NAMES and NAMES[resref:upper()]
  local name = strref and type(Infinity_FetchString) == "function" and Infinity_FetchString(strref)
  if type(name) ~= "string" or name == "" then return resref end
  return name
end

-- The creature's active spells, soonest to expire first, each { resref, name, seconds }: one entry
-- per source of its timed effects with an expiry, the latest of them, in game seconds rounded up;
-- nil when the list or the clock cannot be read. Permanent and equipped effects have no expiry.
local function active_spells(sprite)
  local now = W.game_time()
  local list = now and W.effects(sprite, "timed")
  if not list then return nil end
  local latest, out = {}, {}
  for _, e in ipairs(list) do
    local left = W.remaining(e, now)
    if left and e.source and e.source ~= "" then
      if latest[e.source] == nil then out[#out + 1] = { resref = e.source } end
      latest[e.source] = math.max(latest[e.source] or 0, left)
    end
  end
  for _, s in ipairs(out) do
    s.name = spell_name(s.resref)
    s.seconds = math.ceil(latest[s.resref] / O.effect.ticks_per_second)
  end
  table.sort(out, function(a, b)
    if a.seconds ~= b.seconds then return a.seconds < b.seconds end
    return a.resref < b.resref
  end)
  return out
end

local function record(sprite, party)
  local c, why = W.creature(sprite)
  if not c then return nil, why end
  local r = {
    schema = SCHEMA,
    id = c.id,
    resref = c.resref,
    name = c.name,
    allegiance = allegiance(c.id, c.ea, party),
    hp = { cur = c.hp.cur, max = c.hp.max },
    ac = c.ac.value,
    ac_mods = pick(c.ac, AC_MODS),
    thac0 = c.thac0,
    saves = pick(c.saves, SAVES),
    resist = pick(c.resist, RESISTS),
    mr = c.mr,
  }
  local field = unreadable(r)
  if field then return nil, "unreadable: " .. field end
  r.effects = active_spells(sprite) -- optional: missing when unreadable
  return r
end

local FILTERS = {
  all = function() return true end,
  enemies = function(side) return side == "enemy" end,
  party = function(side) return side == "party" end,
}

local function list(filter)
  filter = filter or "all"
  if not FILTERS[filter] then return nil, "unknown filter: " .. tostring(filter) end
  local s, area = state()
  if s ~= "ok" then return nil, s end
  local found, why = W.creatures(area.pointer)
  if not found then return nil, why end
  local party = party_ids()
  local out = {}
  for _, e in ipairs(found) do
    local a = allegiance(e.id, e.ea, party)
    if FILTERS[filter](a.side) then
      -- Each creature on its own: one whose name cannot be read is listed without one.
      local ok, c = pcall(W.creature, e.sprite)
      local name = ok and type(c) == "table" and c.name or ""
      out[#out + 1] = { id = e.id, name = name, allegiance = a, sprite = e.sprite }
    end
  end
  return { area = area.resref, creatures = out }
end

local function get(id)
  local s = state()
  if s ~= "ok" then return nil, s end
  if type(id) ~= "number" then return nil, "not an id: " .. tostring(id) end
  local sprite, why = W.lookup(id)
  if not sprite then return nil, why end
  return record(sprite, party_ids())
end

local NO_PORTRAIT, NOTHING = "no portrait under the pointer", "nothing under the pointer"

-- The record of the creature under the pointer in the area on screen.
local function hovered()
  local s = state()
  if s ~= "ok" then return nil, s end
  local sprite, why = W.picked()
  if not sprite then return nil, why end
  return record(sprite, party_ids())
end

-- The record of the party member whose portrait is under the pointer. ui.menu sets the global
-- mouseOverPortrait to the portrait's slot, 0 to 5, as the pointer enters it and to -1 as it leaves;
-- portrait N shows party slot N.
local function portrait()
  local s = state()
  if s ~= "ok" then return nil, s end
  local slot = mouseOverPortrait
  if type(slot) ~= "number" or slot < 0 then return nil, NO_PORTRAIT end
  local party, why = W.party()
  if not party then return nil, why end
  local member = party[slot + 1]
  if not member then return nil, "no party member in slot " .. slot end
  if not member.sprite then return nil, member.why end
  return record(member.sprite, party_ids())
end

I = {}

function I.version()
  local build
  if native() then
    local ok, _, name = pcall(N.Version)
    if ok then build = name end
  end
  return { api = API, schema = SCHEMA, build = build }
end

function I.status()
  return (guarded(state)) or "no_native"
end

function I.get(id)
  return guarded(get, id)
end

function I.hovered()
  return guarded(hovered)
end

function I.portrait()
  return guarded(portrait)
end

function I.list(filter)
  local result, why = guarded(list, filter)
  if not result then return nil, why end
  -- The sprite address is the API's own business, not the caller's.
  for _, c in ipairs(result.creatures) do c.sprite = nil end
  return result
end

-- A line in the message window, and the same text in the session log, so what the window showed can
-- be read afterwards: a command that printed nothing, or stopped early, leaves its trace.
local function say(text)
  if type(Infinity_DisplayString) == "function" then Infinity_DisplayString(text) end
  if type(Infinity_Log) == "function" then Infinity_Log(text) end
end

local function emit(r)
  for _, line in ipairs(F.lines(r)) do say(line) end
  local line, why = J.line("INSPECTOR_DATA", r)
  if line and type(Infinity_Log) == "function" then Infinity_Log(line) end
  if not line then say("[Inspector] could not write the record: " .. tostring(why)) end
end

-- The commands a player types; I.show(id) is for mods holding an id (docs/api.md), so not here.
local USAGE = '[Inspector] point at a creature or a portrait, or I.show("enemies"), ' ..
  'I.show("party") or I.show("all")'

-- What the hotkey shows: the portrait under the pointer, else the creature under it; the usage line
-- when the pointer is on neither, and the reason when what is there cannot be read.
local function show_pointed()
  local r, why = portrait()
  if not r and why == NO_PORTRAIT then r, why = hovered() end
  if r then return emit(r) end
  if why == NOTHING then return say(USAGE) end
  say("[Inspector] " .. tostring(why))
end

local function show(what)
  if what == nil then return show_pointed() end
  if type(what) == "number" then
    local r, why = get(what)
    if not r then return say("[Inspector] " .. tostring(what) .. ": " .. tostring(why)) end
    return emit(r)
  end
  local found, why = list(what)
  if not found then return say("[Inspector] " .. tostring(why)) end
  if #found.creatures == 0 then return say("[Inspector] no " .. what .. " in " .. tostring(found.area)) end
  local party = party_ids()
  local shown, unreadable = 0, 0
  for _, c in ipairs(found.creatures) do
    -- Each creature on its own, so one that cannot be read does not stop the rest.
    local ok, r, reason = pcall(record, c.sprite, party)
    if ok and r then
      emit(r)
      shown = shown + 1
    else
      unreadable = unreadable + 1
      say("[Inspector] " .. tostring(c.id) .. ": " .. tostring(ok and reason or r))
    end
  end
  say(string.format("[Inspector] %s in %s: %d shown, %d not readable", what, tostring(found.area), shown,
    unreadable))
end

function I.show(what)
  local ok, err = pcall(show, what)
  if not ok then say("[Inspector] error: " .. tostring(err)) end
end
