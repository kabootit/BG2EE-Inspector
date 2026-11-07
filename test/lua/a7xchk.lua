-- a7xchk.lua: the in-game half of docs/manual-tests/walker.md, the party check.
--
-- Copied into the game's override/ folder with a7xoff.lua and a7xwalk.lua for the test only, and
-- removed after it. Typed in the debug console as Infinity_DoFile("a7xchk"), it loads the walker,
-- then for each party member compares what the walker reads with what the engine shows in
-- characters[id], the table the record screen is drawn from. Every result is one log line through
-- Infinity_Log, read afterwards by deno task verify:
--
--   A7XCHECK <run> party <count>
--   A7XCHECK <run> <id> <field> <ok|DIFF> walker=<value> | engine=<value>
--   A7XCHECK <run> <id> skip <reason>
--   A7XWALK <run> <id> <name>=<value> ...   (recorded, not compared)
--
-- characters[id] is filled only for a party member whose record screen has been opened. Everything
-- runs inside pcall, so a failure is logged rather than raised into the game.

A7XCHK_run = (A7XCHK_run or 0) + 1
local run = A7XCHK_run

local function log(...)
  local parts = {}
  for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
  Infinity_Log(table.concat(parts, " "))
end

local function compare(id, field, walker, engine)
  log("A7XCHECK", run, id, field, walker == engine and "ok" or "DIFF",
    "walker=" .. tostring(walker) .. " | engine=" .. tostring(engine))
end

-- The record screen's save text: five "base (shown)" pairs, death to spell.
local function save_pairs(text)
  local pairs_ = {}
  if type(text) == "string" then
    for base, shown in text:gmatch("(%-?%d+) %((%-?%d+)%)") do
      pairs_[#pairs_ + 1] = { tonumber(base), tonumber(shown) }
    end
  end
  return pairs_
end
A7XCHK_save_pairs = save_pairs

local function check_member(member)
  local id = member.id
  if not member.sprite then return log("A7XCHECK", run, id, "skip", member.why or "no sprite") end
  local c, why = A7XWALK.creature(member.sprite)
  if not c then return log("A7XCHECK", run, id, "skip", why) end
  local e = type(characters) == "table" and characters[id] or nil
  if type(e) ~= "table" then return log("A7XCHECK", run, id, "skip", "not-populated") end
  local HP, AC, THAC0 = e.HP or {}, e.AC or {}, e.THAC0 or {}
  compare(id, "name", c.name, e.name)
  compare(id, "hp.cur", c.hp.cur, HP.current)
  compare(id, "hp.max", c.hp.max, HP.max)
  compare(id, "ac", c.ac.value, AC.current)
  for _, mod in ipairs({ "crushing", "missile", "piercing", "slashing" }) do
    compare(id, "ac." .. mod, c.ac[mod], AC[mod])
  end
  compare(id, "thac0", c.thac0_shown, THAC0.current)
  local shown = save_pairs(e.savingThrows)
  for i, save in ipairs(A7XWALK.SAVES) do
    local pair = shown[i] or {}
    compare(id, "save." .. save .. ".base", c.saves_base[save], pair[1])
    compare(id, "save." .. save, c.saves_shown[save], pair[2])
  end
  local extra = {
    "ea_a=" .. tostring(c.ea.a), "ea_b=" .. tostring(c.ea.b), "block=" .. c.stats_block,
    "state=" .. tostring(c.state), "thac0_stat=" .. tostring(c.thac0), "mr=" .. tostring(c.mr),
  }
  for _, r in ipairs(A7XWALK.RESISTS) do extra[#extra + 1] = r .. "=" .. tostring(c.resist[r]) end
  log("A7XWALK", run, id, table.concat(extra, " "))
end

local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("a7xoff")
    Infinity_DoFile("a7xwalk")
  end
  if type(A7XWALK) ~= "table" then return log("A7XCHECK", run, "party", "error", "walker not loaded") end
  local party, why = A7XWALK.party()
  if not party then return log("A7XCHECK", run, "party", "error", why) end
  log("A7XCHECK", run, "party", #party)
  for _, member in ipairs(party) do check_member(member) end
end)
if not ok then log("A7XCHECK", run, "party", "error", tostring(err)) end
