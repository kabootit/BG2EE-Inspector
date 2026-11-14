-- a7xchk.lua: the in-game half of docs/manual-tests/walker.md, the party check.
--
-- Copied into the game's override/ folder with a7xoff.lua, a7xwalk.lua and a7xjson.lua for the test
-- only, and removed after it. Typed in the debug console as Infinity_DoFile("a7xchk"), it loads the
-- walker, then for each party member compares what the walker reads with what the engine shows in
-- characters[id], the table the record screen is drawn from. Every result is one log line through
-- Infinity_Log, read afterwards by deno task verify: "A7XCHECK", a tab, and a JSON object with the
-- run and a kind. The kinds and their fields are defined in src/model/schemas.ts (CheckLine):
--
--   party (size), field (id, field, walker, engine, ok), skip (id, why), error (why)
--   walk (id, block, state, thac0_stat, mr, resist, keys, proficiencies_keys, saving_throws) and
--   dump (id, at, hex): evidence about each member, recorded, not compared; the dump in 512-byte
--   lines, each with its offset, so no line is longer than the game's log keeps
--
-- characters[id] is filled only for a party member whose record screen has been opened. Everything
-- runs inside pcall, so a failure is logged rather than raised into the game. When it finishes, one
-- summary line goes to the message window (Infinity_DisplayString), so the tester sees that it ran.

A7XCHK_run = (A7XCHK_run or 0) + 1
local run = A7XCHK_run

-- One line: the run and `t`, as JSON. A line that cannot be written whole becomes an error line.
local function emit(t)
  t.run = run
  local line, why = A7XJSON.line("A7XCHECK", t)
  Infinity_Log(line or A7XJSON.line("A7XCHECK", { run = run, kind = "error", why = why }))
end

local tally = { members = 0, equal = 0, differ = 0, skipped = 0 }

local function compare(id, field, walker, engine)
  local same = walker == engine
  tally[same and "equal" or "differ"] = tally[same and "equal" or "differ"] + 1
  emit({ kind = "field", id = id, field = field, walker = walker, engine = engine, ok = same })
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
local DUMP_CHUNK = 512 -- bytes per dump line, so each line stays under A7XJSON.MAX_LINE
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
  tally.members = tally.members + 1
  local id = member.id
  local function skip(why)
    tally.skipped = tally.skipped + 1
    emit({ kind = "skip", id = id, why = why })
  end
  if not member.sprite then return skip(member.why or "no sprite") end
  local c, why = A7XWALK.creature(member.sprite)
  if not c then return skip(why) end
  local e = type(characters) == "table" and characters[id] or nil
  if type(e) ~= "table" then return skip("not-populated") end
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
  -- Evidence, recorded and not compared: the walker's other values, what characters[id] holds, the
  -- save text as the engine wrote it, and the sprite's first bytes, which deno task verify searches.
  local function keys_of(t)
    local keys = {}
    for k in pairs(type(t) == "table" and t or {}) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    return keys
  end
  local text = details.savingThrows
  emit({
    kind = "walk", id = id, block = c.stats_block, state = c.state, thac0_stat = c.thac0, mr = c.mr,
    resist = c.resist, keys = keys_of(e), proficiencies_keys = keys_of(e.proficiencies),
    saving_throws = type(text) == "string" and text:sub(1, 400) or nil,
  })
  for at = 0, DUMP_BYTES - 1, DUMP_CHUNK do
    emit({ kind = "dump", id = id, at = at, hex = hex(member.sprite + at, DUMP_CHUNK) })
  end
end

local failure
local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("a7xoff")
    Infinity_DoFile("a7xwalk")
    Infinity_DoFile("a7xjson")
  end
  if type(A7XWALK) ~= "table" or type(A7XJSON) ~= "table" then failure = "walker or JSON writer not loaded" return end
  local party, why = A7XWALK.party()
  if not party then failure = why return end
  emit({ kind = "party", size = #party })
  for _, member in ipairs(party) do check_member(member) end
end)
if not ok then failure = tostring(err) end
if failure and type(A7XJSON) == "table" then emit({ kind = "error", why = failure }) end

-- The acknowledgement in the game: one line in the message window, which the console shows above itself.
local summary = failure and string.format("A7X party check %d could not run: %s", run, failure) or
  string.format("A7X party check %d: %d members, %d fields equal, %d differ, %d skipped (details in the session log)",
    run, tally.members, tally.equal, tally.differ, tally.skipped)
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
A7XCHK_summary = summary
