-- a7xlist.lua: the creature list check, run in the game with Infinity_DoFile("a7xlist") after
-- a7xoff.lua, a7xwalk.lua and this file are copied into override/ (docs/manual-tests/creatures.md).
--
-- Lists every creature in the area on screen, then checks the list against what the engine itself
-- provides: every party member (the ids behind the portraits) is in it and friendly, no id appears
-- twice, each id leads back to its sprite by the engine's own id rule, and every creature has a
-- name. It writes, through Infinity_Log:
--
--   A7XLIST <run> area index=<i> resref=<resref>
--   A7XLIST <run> scan slots=<n> objects=<n> sprites=<n> listed=<n> ms=<t>
--   A7XLIST <run> creature <id> ea=<ea> group=<group> party=<yes|no> hp=<cur>/<max> state=<hex> name=<name>
--   A7XLIST <run> check <name> <ok|DIFF> <detail>
--   A7XLIST <run> error <why>
--
-- Everything runs inside pcall, so a failure is logged rather than raised into the game. When it
-- finishes, one summary line goes to the message window (Infinity_DisplayString).

A7XLIST_run = (A7XLIST_run or 0) + 1
local run = A7XLIST_run

local function log(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  Infinity_Log(table.concat(parts, " "))
end

local tally = { ok = 0, differ = 0 }
local function check(name, ok, detail)
  tally[ok and "ok" or "differ"] = tally[ok and "ok" or "differ"] + 1
  log("A7XLIST", run, "check", name, ok and "ok" or "DIFF", detail)
end

-- Lua 5.2's %x refuses negative numbers, so a state with its top bit set is shown as unsigned.
local function hex(n)
  return type(n) == "number" and string.format("0x%x", n % 2 ^ 32) or "nil"
end

local function list_of(ids)
  return #ids == 0 and "none" or table.concat(ids, ",")
end

local failure, resref
local totals = { creatures = 0, party = 0, hostile = 0, other = 0 }

local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("a7xoff")
    Infinity_DoFile("a7xwalk")
  end
  if type(A7XWALK) ~= "table" or not A7XWALK.creatures then failure = "walker not loaded" return end
  local area, why = A7XWALK.visible_area()
  if not area then failure = why return end
  resref = area.resref
  log("A7XLIST", run, "area", "index=" .. area.index, "resref=" .. tostring(resref))
  local clock = type(os) == "table" and type(os.clock) == "function" and os.clock or nil
  local started = clock and clock()
  local list, counts = A7XWALK.creatures(area.pointer)
  if not list then failure = counts return end
  local ms = clock and string.format("%.1f", (clock() - started) * 1000) or "-"
  log("A7XLIST", run, "scan", "slots=" .. counts.slots, "objects=" .. counts.objects,
    "sprites=" .. counts.sprites, "listed=" .. #list, "ms=" .. ms)
  local party, party_why = A7XWALK.party()
  if not party then failure = party_why return end
  local in_party = {}
  for _, m in ipairs(party) do in_party[m.id] = true end

  local seen, repeated, astray, unnamed = {}, {}, {}, {}
  for _, e in ipairs(list) do
    local c = A7XWALK.creature(e.sprite) or {}
    local hp = c.hp or {}
    local group = A7XWALK.ea_group(e.ea)
    totals.creatures = totals.creatures + 1
    if in_party[e.id] then
      totals.party = totals.party + 1
    elseif group == "hostile" then
      totals.hostile = totals.hostile + 1
    else
      totals.other = totals.other + 1
    end
    log("A7XLIST", run, "creature", e.id, "ea=" .. tostring(e.ea), "group=" .. tostring(group),
      "party=" .. (in_party[e.id] and "yes" or "no"), "hp=" .. tostring(hp.cur) .. "/" .. tostring(hp.max),
      "state=" .. hex(c.state), "name=" .. tostring(c.name))
    if seen[e.id] then repeated[#repeated + 1] = tostring(e.id) end
    seen[e.id] = e
    if A7XWALK.lookup(e.id) ~= e.sprite then astray[#astray + 1] = tostring(e.id) end
    if type(c.name) ~= "string" or c.name == "" then unnamed[#unnamed + 1] = tostring(e.id) end
  end

  for _, m in ipairs(party) do
    local e = seen[m.id]
    check("party." .. m.id, e ~= nil, e and "listed" or "not in the list")
    if e then
      check("party." .. m.id .. ".group", A7XWALK.ea_group(e.ea) == "friendly", "ea=" .. tostring(e.ea))
    end
  end
  check("unique", #repeated == 0, "repeated: " .. list_of(repeated))
  check("lookup", #astray == 0, "not leading back: " .. list_of(astray))
  check("names", #unnamed == 0, "no name: " .. list_of(unnamed))
end)
if not ok then failure = tostring(err) end
if failure then log("A7XLIST", run, "error", failure) end

local summary
if failure then
  summary = string.format("A7X creature list %d could not run: %s", run, failure)
else
  summary = string.format("A7X creature list %d: %s, %d creatures (%d party, %d hostile, %d other), %s (details in the session log)",
    run, tostring(resref), totals.creatures, totals.party, totals.hostile, totals.other,
    tally.differ == 0 and "all checks ok" or string.format("%d of %d checks differ", tally.differ, tally.ok + tally.differ))
end
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
A7XLIST_summary = summary
