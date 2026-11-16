-- insplist.lua: the creature list check, run in the game with Infinity_DoFile("insplist") after
-- inspoff.lua, inspwalk.lua, inspjson.lua and this file are copied into override/
-- (docs/manual-tests/creatures.md).
--
-- Lists every creature in the area on screen, then checks the list against what the engine itself
-- provides: every party member (the ids behind the portraits) is in it and friendly, no id appears
-- twice, each id leads back to its sprite by the engine's own id rule, and every creature has a
-- name. Each result is one line through Infinity_Log: "INSPECTOR_LIST", a tab, and a JSON object with the
-- run and a kind. The kinds and their fields are defined in src/model/schemas.ts (ListLine):
--
--   area (index, resref), scan (slots, objects, sprites, listed, ms),
--   creature (id, ea, group, party, hp, state, name), check (name, ok, detail), error (why)
--
-- Everything runs inside pcall, so a failure is logged rather than raised into the game. When it
-- finishes, one summary line goes to the message window (Infinity_DisplayString).

INSPECTOR_LIST_run = (INSPECTOR_LIST_run or 0) + 1
local run = INSPECTOR_LIST_run

-- One line: the run and `t`, as JSON. A line that cannot be written whole becomes an error line.
local function emit(t)
  t.run = run
  local line, why = INSPECTOR_JSON.line("INSPECTOR_LIST", t)
  Infinity_Log(line or INSPECTOR_JSON.line("INSPECTOR_LIST", { run = run, kind = "error", why = why }))
end

local tally = { ok = 0, differ = 0 }
local function check(name, ok, detail)
  tally[ok and "ok" or "differ"] = tally[ok and "ok" or "differ"] + 1
  emit({ kind = "check", name = name, ok = ok, detail = detail })
end

local function list_of(ids)
  return #ids == 0 and "none" or table.concat(ids, ",")
end

local failure, resref
local totals = { creatures = 0, party = 0, hostile = 0, other = 0 }

local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("inspoff")
    Infinity_DoFile("inspwalk")
    Infinity_DoFile("inspjson")
  end
  if type(INSPECTOR_WALK) ~= "table" or not INSPECTOR_WALK.creatures or type(INSPECTOR_JSON) ~= "table" then
    failure = "walker or JSON writer not loaded"
    return
  end
  local area, why = INSPECTOR_WALK.visible_area()
  if not area then failure = why return end
  resref = area.resref
  emit({ kind = "area", index = area.index, resref = resref })
  local clock = type(os) == "table" and type(os.clock) == "function" and os.clock or nil
  local started = clock and clock()
  local list, counts = INSPECTOR_WALK.creatures(area.pointer)
  if not list then failure = counts return end
  local ms = clock and tonumber(string.format("%.1f", (clock() - started) * 1000)) or nil
  emit({ kind = "scan", slots = counts.slots, objects = counts.objects, sprites = counts.sprites,
    listed = #list, ms = ms })
  local party, party_why = INSPECTOR_WALK.party()
  if not party then failure = party_why return end
  local in_party = {}
  for _, m in ipairs(party) do in_party[m.id] = true end

  local seen, repeated, astray, unnamed = {}, {}, {}, {}
  for _, e in ipairs(list) do
    local c = INSPECTOR_WALK.creature(e.sprite) or {}
    local hp = c.hp or {}
    local group = INSPECTOR_WALK.ea_group(e.ea)
    totals.creatures = totals.creatures + 1
    if in_party[e.id] then
      totals.party = totals.party + 1
    elseif group == "hostile" then
      totals.hostile = totals.hostile + 1
    else
      totals.other = totals.other + 1
    end
    emit({ kind = "creature", id = e.id, ea = e.ea, group = group, party = in_party[e.id] == true,
      hp = (hp.cur or hp.max) and { cur = hp.cur, max = hp.max } or nil, state = c.state, name = c.name })
    if seen[e.id] then repeated[#repeated + 1] = tostring(e.id) end
    seen[e.id] = e
    if INSPECTOR_WALK.lookup(e.id) ~= e.sprite then astray[#astray + 1] = tostring(e.id) end
    if type(c.name) ~= "string" or c.name == "" then unnamed[#unnamed + 1] = tostring(e.id) end
  end

  for _, m in ipairs(party) do
    local e = seen[m.id]
    check("party." .. m.id, e ~= nil, e and "listed" or "not in the list")
    if e then
      check("party." .. m.id .. ".group", INSPECTOR_WALK.ea_group(e.ea) == "friendly", "ea=" .. tostring(e.ea))
    end
  end
  check("unique", #repeated == 0, "repeated: " .. list_of(repeated))
  check("lookup", #astray == 0, "not leading back: " .. list_of(astray))
  check("names", #unnamed == 0, "no name: " .. list_of(unnamed))
end)
if not ok then failure = tostring(err) end
if failure and type(INSPECTOR_JSON) == "table" then emit({ kind = "error", why = failure }) end

local summary
if failure then
  summary = string.format("Inspector creature list %d could not run: %s", run, failure)
else
  summary = string.format("Inspector creature list %d: %s, %d creatures (%d party, %d hostile, %d other), %s (details in the session log)",
    run, tostring(resref), totals.creatures, totals.party, totals.hostile, totals.other,
    tally.differ == 0 and "all checks ok" or string.format("%d of %d checks differ", tally.differ, tally.ok + tally.differ))
end
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
INSPECTOR_LIST_summary = summary
