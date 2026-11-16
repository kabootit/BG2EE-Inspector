-- inspspwn.lua: the spawn check, run in the game with Infinity_DoFile("inspspwn") after inspoff.lua,
-- inspwalk.lua, inspjson.lua and this file are copied into override/ (docs/manual-tests/spawn.md).
--
-- On its first run in a session it spawns the fixtures below with the engine's own console object
-- (C:CreateCreature), which changes the game: the manual test uses a save that is not saved again.
-- Every run then logs, for each creature in the area on screen made from a fixture's .cre, what the
-- walker reads and the .cre header the engine holds; deno task verify compares both with the files.
-- The fixtures have no items and no effects in their .cre, so equipment cannot change their stats.
--
-- Each result is one line through Infinity_Log: "INSPECTOR_SPAWN", a tab, and a JSON object with the run
-- and a kind. The kinds and their fields are defined in src/model/schemas.ts (SpawnLine):
--
--   spawn (resref, ok, why), error (why), header (id, hex of the .cre header),
--   creature (id, resref, block, hp, ac, thac0, saves, resist, mr, ea), each table by name
--
-- Everything runs inside pcall, and one summary line goes to the message window at the end.

local FIXTURES = { "COWH", "DRBOD", "DADROW8", "SHFIRE" }

INSPECTOR_SPAWN_run = (INSPECTOR_SPAWN_run or 0) + 1
local run = INSPECTOR_SPAWN_run

-- One line: the run and `t`, as JSON. A line that cannot be written whole becomes an error line.
local function emit(t)
  t.run = run
  local line, why = INSPECTOR_JSON.line("INSPECTOR_SPAWN", t)
  Infinity_Log(line or INSPECTOR_JSON.line("INSPECTOR_SPAWN", { run = run, kind = "error", why = why }))
end

local function hex(block)
  return (block:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

local failure
local spawned -- nil when this run did not spawn
local found, missing = 0, {}

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

  if not INSPECTOR_SPAWN_spawned then
    if C == nil then failure = "no console object C" return end
    spawned = 0
    for _, resref in ipairs(FIXTURES) do
      local done, e = pcall(function() C:CreateCreature(resref) end)
      emit({ kind = "spawn", resref = resref, ok = done, why = not done and tostring(e) or nil })
      if done then spawned = spawned + 1 end
    end
    INSPECTOR_SPAWN_spawned = true
  end

  local wanted, seen = {}, {}
  for _, resref in ipairs(FIXTURES) do wanted[resref] = true end
  local list, counts = INSPECTOR_WALK.creatures(area.pointer)
  if not list then failure = counts return end
  local O = INSPECTOR_OFF
  for _, e in ipairs(list) do
    local c = INSPECTOR_WALK.creature(e.sprite)
    local resref = c and c.resref and c.resref:upper()
    if resref and wanted[resref] then
      seen[resref] = true
      emit({
        kind = "creature", id = c.id, resref = resref, block = c.stats_block, hp = c.hp, ac = c.ac,
        thac0 = c.thac0, saves = c.saves, resist = c.resist, mr = c.mr, ea = c.ea,
      })
      local header = Inspector_native.ReadBlock(e.sprite + O.sprite.cre, O.sprite.cre_size)
      emit({ kind = "header", id = c.id, hex = header and hex(header) or nil })
    end
  end
  for _, resref in ipairs(FIXTURES) do
    if seen[resref] then found = found + 1 else missing[#missing + 1] = resref end
  end
end)
if not ok then failure = tostring(err) end
if failure and type(INSPECTOR_JSON) == "table" then emit({ kind = "error", why = failure }) end

local summary
if failure then
  summary = string.format("Inspector spawn check %d could not run: %s", run, failure)
else
  summary = string.format("Inspector spawn check %d: %s, found %d of %d%s (details in the session log)",
    run, spawned and string.format("spawned %d", spawned) or "spawned earlier", found, #FIXTURES,
    #missing > 0 and ", missing " .. table.concat(missing, " ") or "")
end
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
INSPECTOR_SPAWN_summary = summary
