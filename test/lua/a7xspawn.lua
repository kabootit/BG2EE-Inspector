-- a7xspawn.lua: the spawn check, run in the game with Infinity_DoFile("a7xspawn") after a7xoff.lua,
-- a7xwalk.lua and this file are copied into override/ (docs/manual-tests/spawn.md).
--
-- On its first run in a session it spawns the fixtures below with the engine's own console object
-- (C:CreateCreature), which changes the game: the manual test uses a save that is not saved again.
-- Every run then logs, for each creature in the area on screen made from a fixture's .cre, what the
-- walker reads and the .cre header the engine holds; deno task verify compares both with the files.
-- The fixtures have no items and no effects in their .cre, so equipment cannot change their stats.
--
--   A7XSPAWN <run> spawn <resref> <ok|failed> <why>
--   A7XSPAWN <run> creature <id> resref=<r> block=<b> hp=<cur>/<max> ac=<ac>,<crushing>,<missile>,<piercing>,<slashing>
--     thac0=<t> saves=<death>,<wand>,<poly>,<breath>,<spell> resist=<A7XWALK.RESISTS, in order> mr=<m> ea=<ea>
--   A7XSPAWN <run> header <id> <hex of the .cre header>
--   A7XSPAWN <run> error <why>
--
-- Everything runs inside pcall, and one summary line goes to the message window at the end.

local FIXTURES = { "COWH", "DRBOD", "DADROW8", "SHFIRE" }

A7XSPAWN_run = (A7XSPAWN_run or 0) + 1
local run = A7XSPAWN_run

local function log(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  Infinity_Log(table.concat(parts, " "))
end

local function hex(block)
  return (block:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

local function joined(t, keys)
  local out = {}
  for i, k in ipairs(keys) do out[i] = tostring(t[k]) end
  return table.concat(out, ",")
end

local failure
local spawned -- nil when this run did not spawn
local found, missing = 0, {}

local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("a7xoff")
    Infinity_DoFile("a7xwalk")
  end
  if type(A7XWALK) ~= "table" or not A7XWALK.creatures then failure = "walker not loaded" return end
  local area, why = A7XWALK.visible_area()
  if not area then failure = why return end

  if not A7XSPAWN_spawned then
    if C == nil then failure = "no console object C" return end
    spawned = 0
    for _, resref in ipairs(FIXTURES) do
      local done, e = pcall(function() C:CreateCreature(resref) end)
      log("A7XSPAWN", run, "spawn", resref, done and "ok" or "failed", done and "" or tostring(e))
      if done then spawned = spawned + 1 end
    end
    A7XSPAWN_spawned = true
  end

  local wanted, seen = {}, {}
  for _, resref in ipairs(FIXTURES) do wanted[resref] = true end
  local list, counts = A7XWALK.creatures(area.pointer)
  if not list then failure = counts return end
  local O = A7XOFF
  for _, e in ipairs(list) do
    local c = A7XWALK.creature(e.sprite)
    local resref = c and c.resref and c.resref:upper()
    if resref and wanted[resref] then
      seen[resref] = true
      log("A7XSPAWN", run, "creature", c.id, "resref=" .. resref, "block=" .. c.stats_block,
        "hp=" .. tostring(c.hp.cur) .. "/" .. tostring(c.hp.max),
        "ac=" .. joined(c.ac, { "value", "crushing", "missile", "piercing", "slashing" }),
        "thac0=" .. tostring(c.thac0), "saves=" .. joined(c.saves, A7XWALK.SAVES),
        "resist=" .. joined(c.resist, A7XWALK.RESISTS), "mr=" .. tostring(c.mr), "ea=" .. tostring(c.ea))
      local header = A7X_native.ReadBlock(e.sprite + O.sprite.cre, O.sprite.cre_size)
      log("A7XSPAWN", run, "header", c.id, header and hex(header) or "unreadable")
    end
  end
  for _, resref in ipairs(FIXTURES) do
    if seen[resref] then found = found + 1 else missing[#missing + 1] = resref end
  end
end)
if not ok then failure = tostring(err) end
if failure then log("A7XSPAWN", run, "error", failure) end

local summary
if failure then
  summary = string.format("A7X spawn check %d could not run: %s", run, failure)
else
  summary = string.format("A7X spawn check %d: %s, found %d of %d%s (details in the session log)",
    run, spawned and string.format("spawned %d", spawned) or "spawned earlier", found, #FIXTURES,
    #missing > 0 and ", missing " .. table.concat(missing, " ") or "")
end
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
A7XSPAWN_summary = summary
