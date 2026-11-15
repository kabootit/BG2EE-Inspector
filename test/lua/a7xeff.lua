-- a7xeff.lua: the effect probe, run in the game with Infinity_DoFile("a7xeff") after a7xoff.lua,
-- a7xwalk.lua, a7xjson.lua and this file are copied into override/ (docs/manual-tests/effects.md).
--
-- For each party member it reads both effect lists through the walker, A7XWALK.effects ("equipped"
-- at sprite +0x49a0, "timed" at +0x49f0; docs/re-notes.md), and logs each effect's fields, then the
-- engine's own characters[id].statusEffects, the status icons the record screen lists, keyed by icon
-- number. deno task verify checks the walker against it: every icon an opcode-142 effect shows must
-- be listed. Each result is one line through Infinity_Log: "A7XEFF", a tab, and a JSON object with
-- the run and a kind. The kinds and their fields are defined in src/model/schemas.ts (EffectLine):
--
--   party (size, time: the game's clock through the walker, ticks: Infinity_GetGameTicks, clock:
--   Infinity_GetClockTicks, real milliseconds), list (id, head, count, capped, why), effect (id, head, index, opcode,
--   p1, p2, timing, duration, applied, source), status (id, entries, keys), skip (id, why),
--   error (why)
--
-- Run several times in one session, it is also the Effect duration test's probe
-- (docs/manual-tests/durations.md): verify compares the clock and the effects across runs.
--
-- characters[id] is filled only for a party member whose record screen has been opened. Everything
-- runs inside pcall, so a failure is logged rather than raised into the game. When it finishes, one
-- summary line goes to the message window (Infinity_DisplayString).

A7XEFF_run = (A7XEFF_run or 0) + 1
local run = A7XEFF_run

-- One line: the run and `t`, as JSON. A line that cannot be written whole becomes an error line.
local function emit(t)
  t.run = run
  local line, why = A7XJSON.line("A7XEFF", t)
  Infinity_Log(line or A7XJSON.line("A7XEFF", { run = run, kind = "error", why = why }))
end

local tally = { members = 0, effects = 0, skipped = 0 }

-- One list through the walker: every effect on it, as effect lines, then a list line with the count,
-- or with why the walker gave up.
local function walk_list(id, sprite, which, head)
  local effects, why = A7XWALK.effects(sprite, which)
  for i, e in ipairs(effects or {}) do
    emit({ kind = "effect", id = id, head = head, index = i - 1, opcode = e.opcode, p1 = e.p1,
      p2 = e.p2, timing = e.timing, duration = e.duration, applied = e.applied, source = e.source })
  end
  local count = effects and #effects or 0
  tally.effects = tally.effects + count
  local capped = why ~= nil and why:find("more than", 1, true) ~= nil
  emit({ kind = "list", id = id, head = head, count = count, capped = capped, why = why })
end

-- A value of statusEffects as text: a table's keys and values, sorted, as "k=v" joined by ";".
local function text_of(v)
  if type(v) ~= "table" then return tostring(v) end
  local parts = {}
  for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. "=" .. tostring(x) end
  table.sort(parts)
  return table.concat(parts, ";")
end

local function probe_member(member)
  tally.members = tally.members + 1
  local id = member.id
  if not member.sprite then
    tally.skipped = tally.skipped + 1
    return emit({ kind = "skip", id = id, why = member.why or "no sprite" })
  end
  walk_list(id, member.sprite, "equipped", A7XOFF.sprite.equipped_effects[1])
  walk_list(id, member.sprite, "timed", A7XOFF.sprite.timed_effects[1])
  local e = type(characters) == "table" and characters[id] or nil
  if type(e) ~= "table" then
    return emit({ kind = "skip", id = id, why = "not-populated" })
  end
  -- statusEffects, keyed by icon number: every key with its value, sorted; then every key of
  -- characters[id].
  local status, entries = e.statusEffects, {}
  if type(status) == "table" then
    for k, v in pairs(status) do entries[#entries + 1] = (tostring(k) .. ": " .. text_of(v)):sub(1, 200) end
    table.sort(entries)
  elseif status ~= nil then
    entries[1] = (type(status) .. ": " .. tostring(status)):sub(1, 200)
  end
  local keys = {}
  for k in pairs(e) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  emit({ kind = "status", id = id, entries = entries, keys = keys })
end

local failure
local ok, err = pcall(function()
  if type(Infinity_DoFile) == "function" then
    Infinity_DoFile("a7xoff")
    Infinity_DoFile("a7xwalk")
    Infinity_DoFile("a7xjson")
  end
  if type(A7XWALK) ~= "table" or not A7XWALK.effects or type(A7XJSON) ~= "table" then
    failure = "walker or JSON writer not loaded"
    return
  end
  local party, why = A7XWALK.party()
  if not party then failure = why return end
  local ticks = type(Infinity_GetGameTicks) == "function" and Infinity_GetGameTicks() or nil
  local clock = type(Infinity_GetClockTicks) == "function" and Infinity_GetClockTicks() or nil
  emit({ kind = "party", size = #party, time = A7XWALK.game_time(), ticks = ticks, clock = clock })
  for _, member in ipairs(party) do probe_member(member) end
end)
if not ok then failure = tostring(err) end
if failure and type(A7XJSON) == "table" then emit({ kind = "error", why = failure }) end

local summary = failure and string.format("A7X effect probe %d could not run: %s", run, failure) or
  string.format("A7X effect probe %d: %d members, %d effects read, %d skipped (details in the session log)",
    run, tally.members, tally.effects, tally.skipped)
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
A7XEFF_summary = summary
