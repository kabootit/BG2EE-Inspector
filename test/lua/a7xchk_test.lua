-- The party check (test/lua/a7xchk.lua) against the fake game and a fake characters[]: its lines for
-- a member who agrees and one whose record screen was never opened are exactly the golden file
-- test/fixtures/a7xcheck.txt, which test/model/schemas_test.ts checks against the schema; then a
-- deliberate difference, no game, the summary line, and the parse of the record screen's save text.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged, shown
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_DisplayString(s) shown = s end

-- In the engine's format: the shown save, then how far it is from the base save. Member A's bases
-- are 10 to 14 and its shown saves 4, 0, 0, 0 and 7.
local SAVES_A = "Paralysis / Poison / Death: 4 (-6)\nRod / Staff / Wand: 0 (-11)\n" ..
  "Petrification / Polymorph: 0 (-12)\nBreath Weapon: 0 (-13)\nSpell: 7 (-7)"

local function engine_a()
  return {
    name = "Alarion",
    HP = { current = 40, max = 52 },
    AC = { current = -2, crushing = 0, missile = 1, piercing = 0, slashing = 0 },
    THAC0 = { current = 6 },
    proficiencies = { savingThrows = SAVES_A },
  }
end

local function run()
  logged = {}
  A7XCHK_run = nil -- every case is run 1, whatever ran before it
  dofile("test/lua/a7xchk.lua")
  return logged
end

local function golden()
  local lines = {}
  for line in io.lines("test/fixtures/a7xcheck.txt") do lines[#lines + 1] = line end
  return lines
end

local function find(lines, fragment)
  for _, l in ipairs(lines) do
    if l:find(fragment, 1, true) then return l end
  end
end

T.test("the save text gives five shown and base values in order", function()
  F.world()
  run()
  local v = A7XCHK_save_values(SAVES_A)
  T.eq(#v, 5, "saves")
  T.eq(v[1][1], 4, "death shown")
  T.eq(v[1][2], 10, "death base: shown less the bracket")
  T.eq(v[5][2], 14, "spell base")
  -- Lines from the third run: no bracket when shown and base are equal, and a "+" sign.
  local plain = A7XCHK_save_values("Paralysis / Poison / Death: 8\nSpell: 5")
  T.eq(plain[1][1], 8, "shown without a bracket")
  T.eq(plain[1][2], 8, "base equals shown")
  T.eq(A7XCHK_save_values("Spell: 3 (+4)")[1][2], -1, "a plus sign")
  T.eq(#A7XCHK_save_values(nil), 0, "no text")
end)

T.test("a member's save text from the third run gives the values the walker read", function()
  -- Logged in the third run of the party check; the walker read shown -4, -2, -1, -3, -1 and base
  -- 3, 5, 4, 4, 6 for this member.
  local v = A7XCHK_save_values("Paralysis / Poison / Death: -4 (-7)\nRod / Staff / Wand: -2 (-7)\n" ..
    "Petrification / Polymorph: -1 (-5)\nBreath Weapon: -3 (-7)\nSpell: -1 (-7)")
  local shown, base = {}, {}
  for i = 1, #v do shown[i], base[i] = v[i][1], v[i][2] end
  T.eq(table.concat(shown, " "), "-4 -2 -1 -3 -1", "shown")
  T.eq(table.concat(base, " "), "3 5 4 4 6", "base")
end)

T.test("the lines for a member who agrees and one not populated are the golden file", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local lines, want = run(), golden()
  T.eq(#lines, #want, "line count")
  for i = 1, #want do T.eq(lines[i], want[i], "line " .. i) end
  for i = 1, #lines do T.eq(#lines[i] <= A7XJSON.MAX_LINE, true, "line " .. i .. " fits the log") end
  local dumps = 0
  for _, l in ipairs(lines) do if l:find('"kind":"dump"', 1, true) then dumps = dumps + 1 end end
  T.eq(dumps, 4, "the 2048-byte dump in four 512-byte lines")
  T.eq(find(lines, '"kind":"skip"'):find('"why":"not-populated"', 1, true) ~= nil, true, "B skipped")
  T.eq(find(lines, '"kind":"walk"'):find('"keys":["AC","HP","THAC0","name","proficiencies"]', 1, true) ~= nil,
    true, "the keys of characters[id] as evidence")
end)

T.test("a value that differs is a field line with ok false and both values", function()
  F.world()
  local e = engine_a()
  e.HP.max = 53
  characters = { [F.ID_A] = e }
  local line = find(run(), '"field":"hp.max"')
  T.eq(line, 'A7XCHECK\t{"engine":53,"field":"hp.max","id":' .. F.ID_A ..
    ',"kind":"field","ok":false,"run":1,"walker":52}', "the line")
end)

T.test("no game loaded is one error line and a could-not-run summary", function()
  F.world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1], 'A7XCHECK\t{"kind":"error","run":1,"why":"no game loaded"}', "error line")
  T.eq(shown, "A7X party check 1 could not run: no game loaded", "summary")
end)

T.test("the check ends with one summary line in the message window", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  run()
  T.eq(shown, "A7X party check 1: 2 members, 20 fields equal, 0 differ, 1 skipped (details in the session log)", "summary")
end)

T.done()
