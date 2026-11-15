-- a7xeff.lua: the effect probe, run in the game with Infinity_DoFile("a7xeff") after a7xoff.lua,
-- a7xwalk.lua, a7xjson.lua and this file are copied into override/ (docs/manual-tests/effects.md).
--
-- For each party member it walks the two effect lists docs/re-notes.md found statically (sprite
-- +0x49a0 and +0x49f0: a node holds the next node at +0x0 and its effect at +0x10) and logs each
-- effect's candidate fields, read at their offsets in IESDP's EFF V2.0 layout, with its first 16
-- bytes; then the engine's own characters[id].statusEffects, as it is. Nothing here is trusted yet:
-- the offsets live in this file until the game confirms them. Each result is one line through
-- Infinity_Log: "A7XEFF", a tab, and a JSON object with the run and a kind. The kinds and their
-- fields are defined in src/model/schemas.ts (EffectLine):
--
--   party (size, ticks), list (id, head, count, capped, why), effect (id, head, index, first,
--   opcode, target, power, p1, p2, timing, duration, applied, resource, parent_type, source),
--   status (id, entries, keys), skip (id, why), error (why)
--
-- characters[id] is filled only for a party member whose record screen has been opened. Everything
-- runs inside pcall, so a failure is logged rather than raised into the game. When it finishes, one
-- summary line goes to the message window (Infinity_DisplayString).

A7XEFF_run = (A7XEFF_run or 0) + 1
local run = A7XEFF_run

local HEADS = { 0x49a0, 0x49f0 } -- sprite offsets of the two list heads (re effect-lists)
local NODE_NEXT, NODE_EFFECT = 0x0, 0x10
local MAX_NODES = 256

-- Candidate effect fields: { offset, kind } at their EFF V2.0 offsets (IESDP).
local FIELDS = {
  opcode = { 0x10, "u32" }, target = { 0x14, "u32" }, power = { 0x18, "u32" },
  p1 = { 0x1c, "i32" }, p2 = { 0x20, "i32" }, timing = { 0x24, "u16" },
  duration = { 0x28, "u32" }, applied = { 0x6c, "u32" }, parent_type = { 0x90, "u32" },
}
local RESOURCE, SOURCE, RESREF_SIZE = 0x30, 0x94, 8

-- One line: the run and `t`, as JSON. A line that cannot be written whole becomes an error line.
local function emit(t)
  t.run = run
  local line, why = A7XJSON.line("A7XEFF", t)
  Infinity_Log(line or A7XJSON.line("A7XEFF", { run = run, kind = "error", why = why }))
end

local tally = { members = 0, effects = 0, skipped = 0 }

local function hex(addr, n)
  local block = A7X_native.ReadBlock(addr, n)
  if not block then return nil end
  return (block:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

-- One list: every effect on it, as effect lines, then a list line with the count.
local function walk_list(id, sprite, head)
  local node = A7XWALK.read(sprite, { head, "ptr" })
  local count, why = 0, nil
  if node == nil then why = "head unreadable" end
  while node ~= nil and node ~= 0 do
    if not A7XWALK.valid_pointer(node) then why = "bad node pointer" break end
    if count >= MAX_NODES then break end
    local effect = A7XWALK.read(node, { NODE_EFFECT, "ptr" })
    if not A7XWALK.valid_pointer(effect) then why = "bad effect pointer" break end
    local line = { kind = "effect", id = id, head = head, index = count, first = hex(effect, 16) }
    for name, f in pairs(FIELDS) do line[name] = A7XWALK.read(effect, f) end
    line.resource = A7XWALK.resref(effect + RESOURCE, RESREF_SIZE)
    line.source = A7XWALK.resref(effect + SOURCE, RESREF_SIZE)
    emit(line)
    count = count + 1
    node = A7XWALK.read(node, { NODE_NEXT, "ptr" })
  end
  tally.effects = tally.effects + count
  emit({ kind = "list", id = id, head = head, count = count, capped = count >= MAX_NODES, why = why })
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
  for _, head in ipairs(HEADS) do walk_list(id, member.sprite, head) end
  local e = type(characters) == "table" and characters[id] or nil
  if type(e) ~= "table" then
    return emit({ kind = "skip", id = id, why = "not-populated" })
  end
  -- statusEffects as it is, whatever its shape: every key with its value, sorted by key; the first
  -- run read only a list and found none. Then every key of characters[id], to find the icons if
  -- they are elsewhere.
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
  if type(A7XWALK) ~= "table" or type(A7XJSON) ~= "table" then
    failure = "walker or JSON writer not loaded"
    return
  end
  local party, why = A7XWALK.party()
  if not party then failure = why return end
  local ticks = type(Infinity_GetGameTicks) == "function" and Infinity_GetGameTicks() or nil
  emit({ kind = "party", size = #party, ticks = ticks })
  for _, member in ipairs(party) do probe_member(member) end
end)
if not ok then failure = tostring(err) end
if failure and type(A7XJSON) == "table" then emit({ kind = "error", why = failure }) end

local summary = failure and string.format("A7X effect probe %d could not run: %s", run, failure) or
  string.format("A7X effect probe %d: %d members, %d effects read, %d skipped (details in the session log)",
    run, tally.members, tally.effects, tally.skipped)
if type(Infinity_DisplayString) == "function" then pcall(Infinity_DisplayString, summary) end
A7XEFF_summary = summary
