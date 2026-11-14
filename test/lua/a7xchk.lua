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

-- The record screen's save text, one line per save, death to spell, as the party check's third run
-- logged it: "Paralysis / Poison / Death: -4 (-7)". The first number is the save as shown; the one
-- in brackets, present only when it is not 0, is how far that is from the base save. So each line
-- gives { shown, base }. Signs may be "+" or "-".
local function save_values(text)
  local values = {}
  if type(text) ~= "string" then return values end
  for line in text:gmatch("[^\n]+") do
    local shown, diff = line:match(":%s*([+-]?%d+)%s*%(([+-]?%d+)%)%s*$")
    shown = shown or line:match(":%s*([+-]?%d+)%s*$")
    if shown then
      values[#values + 1] = { tonumber(shown), tonumber(shown) - (tonumber(diff) or 0) }
    end
  end
  return values
end
A7XCHK_save_values = save_values

local DUMP_BYTES = 2048
local PC = 2 -- EA of a party member

-- The bytes at `addr` in hex, read 256 at a time; "??" for each byte of a block that fails.
local function hex(addr, n)
  local out = {}
  for at = 0, n - 1, 256 do
    local block = A7X_native.ReadBlock(addr + at, 256)
    for i = 1, 256 do
      out[#out + 1] = block and string.format("%02x", block:byte(i)) or "??"
    end
  end
  return table.concat(out)
end

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
  compare(id, "ea", c.ea, PC) -- not in characters[]: every party member is a PC
  -- The save text is in the proficiencies subtable, where the record screen's details are.
  local details = type(e.proficiencies) == "table" and e.proficiencies or {}
  local saves = save_values(details.savingThrows)
  for i, save in ipairs(A7XWALK.SAVES) do
    local value = saves[i] or {}
    compare(id, "save." .. save, c.saves_shown[save], value[1])
    compare(id, "save." .. save .. ".base", c.saves_base[save], value[2])
  end
  local extra = {
    "block=" .. c.stats_block,
    "state=" .. tostring(c.state), "thac0_stat=" .. tostring(c.thac0), "mr=" .. tostring(c.mr),
  }
  for _, r in ipairs(A7XWALK.RESISTS) do extra[#extra + 1] = r .. "=" .. tostring(c.resist[r]) end
  log("A7XWALK", run, id, table.concat(extra, " "))
  -- Evidence for fields still being located: what characters[id] holds, the save text as the
  -- engine wrote it, and the sprite's first bytes, which deno task verify searches.
  local function keys_of(t)
    local keys = {}
    for k in pairs(type(t) == "table" and t or {}) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    return table.concat(keys, ",")
  end
  log("A7XWALK", run, id, "keys=" .. keys_of(e))
  log("A7XWALK", run, id, "proficiencies.keys=" .. keys_of(e.proficiencies))
  local text = details.savingThrows
  log("A7XWALK", run, id, "savingThrows=" .. type(text) ..
    (type(text) == "string" and (" " .. text:sub(1, 400):gsub("\n", "\\n")) or ""))
  log("A7XDUMP", run, id, hex(member.sprite, DUMP_BYTES))
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
