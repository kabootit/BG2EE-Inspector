-- The effect probe (test/lua/a7xeff.lua) against the fake game: its lines are exactly the golden
-- file test/fixtures/a7xeff.txt, which test/model/schemas_test.ts checks against the schema; then a
-- broken list, a list longer than the node cap, a member whose record screen was not opened, no
-- game, and the summary line in the message window.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged, shown
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_DisplayString(s) shown = s end
function Infinity_GetGameTicks() return 54000 end

-- The fake game with the golden file's effects: A has a ring's effect on the equipped list and a
-- spell's two on the timed list, the spell's icon among the record screen's statusEffects, keyed by
-- icon number as the game has it; B has none.
local function world()
  F.world()
  F.effects(F.A, "timed", {
    { opcode = 142, p2 = 38, timing = 4096, duration = 12369494, source = "SPPR101" },
    { opcode = 0, p2 = 0, timing = 4096, duration = 12369494, source = "SPPR101" },
  })
  F.effects(F.A, "equipped", { { opcode = 1, timing = 2, source = "RING02" } })
  characters = {
    [F.ID_A] = { statusEffects = { [38] = { bam = "STATES", current = 1, strRef = 1234 } } },
    [F.ID_B] = {},
  }
end

local function run()
  logged, shown = {}, nil
  A7XEFF_run = nil -- every case is run 1, whatever ran before it
  dofile("test/lua/a7xeff.lua")
  return logged
end

local function golden()
  local lines = {}
  for line in io.lines("test/fixtures/a7xeff.txt") do lines[#lines + 1] = line end
  return lines
end

local function find(lines, fragment)
  for _, l in ipairs(lines) do
    if l:find(fragment, 1, true) then return l end
  end
end

T.test("the lines for the party are the golden file", function()
  world()
  local lines, want = run(), golden()
  T.eq(#lines, #want, "line count")
  for i = 1, #want do T.eq(lines[i], want[i], "line " .. i) end
  T.eq(shown, "A7X effect probe 1: 2 members, 3 effects read, 0 skipped (details in the session log)",
    "the summary")
end)

T.test("a node pointing nowhere stops the walk with a reason", function()
  world()
  F.put(F.A + 0x49f0, "ptr", 0x10) -- not a pointer
  local lines = run()
  T.eq(find(lines, '"head":18928,"id":' .. F.ID_A) ~= nil, true, "the list line")
  T.eq(find(lines, '"why":"bad node pointer"') ~= nil, true, "its reason")
end)

T.test("a list longer than the node cap gives no effects and says why", function()
  world()
  local many = {}
  for i = 1, 300 do many[i] = { opcode = 0, source = "SPWI101" } end
  F.effects(F.B, "timed", many)
  local lines = run()
  T.eq(find(lines, '"capped":true,"count":0,"head":18928,"id":' .. F.ID_B) ~= nil, true, "capped")
  T.eq(find(lines, '"why":"more than 256 effects"') ~= nil, true, "the reason")
end)

T.test("a member whose record screen was not opened is probed but has no status line", function()
  world()
  characters = {}
  local lines = run()
  T.eq(find(lines, '"kind":"status"'), nil, "no status line")
  T.eq(find(lines, '"why":"not-populated"') ~= nil, true, "the skip")
  T.eq(find(lines, '"count":2,"head":18928') ~= nil, true, "the lists still walked")
end)

T.test("no game loaded is one error line and a could-not-run summary", function()
  world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1]:find('"kind":"error"', 1, true) ~= nil, true, "an error line")
  T.eq(shown:find("could not run", 1, true) ~= nil, true, "the summary says so")
end)

T.done()
