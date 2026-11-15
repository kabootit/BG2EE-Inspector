-- a7xapi.lua: the inspector's public API, the global A7X (docs/api.md), API 1.1, records of schema 1
-- (docs/data-model.md).
--
-- Loaded last by a7x.lua. It keeps the other inspector files' tables as locals and clears their
-- globals, so A7X is the only global the inspector leaves. The native table is captured the first
-- time a call finds A7X_native, and that global is cleared too, so no other Lua can make raw memory
-- reads; lazily, because this file may load before the library registers the table. Every call
-- returns fresh tables and none raises: a failure is nil and a reason.

local O, W, J, F = A7XOFF, A7XWALK, A7XJSON, A7XFMT
A7XOFF, A7XWALK, A7XJSON, A7XFMT = nil, nil, nil, nil

local API, SCHEMA = "1.1", 1

local N
local function native()
  if not N and type(A7X_native) == "table" then
    N = A7X_native
    A7X_native = nil
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

A7X = {}

function A7X.version()
  local build
  if native() then
    local ok, _, name = pcall(N.Version)
    if ok then build = name end
  end
  return { api = API, schema = SCHEMA, build = build }
end

function A7X.status()
  return (guarded(state)) or "no_native"
end

function A7X.get(id)
  return guarded(get, id)
end

function A7X.hovered()
  return guarded(hovered)
end

function A7X.portrait()
  return guarded(portrait)
end

function A7X.list(filter)
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
  local line, why = J.line("A7XDATA", r)
  if line and type(Infinity_Log) == "function" then Infinity_Log(line) end
  if not line then say("[A7X] could not write the record: " .. tostring(why)) end
end

local USAGE = '[A7X] point at a creature or a portrait, or A7X.show(id), A7X.show("enemies"), ' ..
  'A7X.show("party") or A7X.show("all")'

-- What the hotkey shows: the portrait under the pointer, else the creature under it; the usage line
-- when the pointer is on neither, and the reason when what is there cannot be read.
local function show_pointed()
  local r, why = portrait()
  if not r and why == NO_PORTRAIT then r, why = hovered() end
  if r then return emit(r) end
  if why == NOTHING then return say(USAGE) end
  say("[A7X] " .. tostring(why))
end

local function show(what)
  if what == nil then return show_pointed() end
  if type(what) == "number" then
    local r, why = get(what)
    if not r then return say("[A7X] " .. tostring(what) .. ": " .. tostring(why)) end
    return emit(r)
  end
  local found, why = list(what)
  if not found then return say("[A7X] " .. tostring(why)) end
  if #found.creatures == 0 then return say("[A7X] no " .. what .. " in " .. tostring(found.area)) end
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
      say("[A7X] " .. tostring(c.id) .. ": " .. tostring(ok and reason or r))
    end
  end
  say(string.format("[A7X] %s in %s: %d shown, %d not readable", what, tostring(found.area), shown,
    unreadable))
end

function A7X.show(what)
  local ok, err = pcall(show, what)
  if not ok then say("[A7X] error: " .. tostring(err)) end
end
