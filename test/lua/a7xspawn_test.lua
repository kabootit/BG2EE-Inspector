-- The spawn check (test/lua/a7xspawn.lua) against the fake game and a fake console object C: its
-- lines for a fixture found are exactly the golden file test/fixtures/a7xspawn.txt, which
-- test/model/schemas_test.ts checks against the schema; then the spawn calls on the first run only,
-- a fixture in another area, a spawn that fails, no C, and the summary line.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged, shown, calls
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_DisplayString(s) shown = s end

local function console()
  calls = {}
  C = { CreateCreature = function(self, resref) calls[#calls + 1] = resref end }
end

local function run()
  logged, shown = {}, nil
  dofile("test/lua/a7xspawn.lua")
  return logged
end

-- A fresh session: no run yet, nothing spawned.
local function session()
  A7XSPAWN_run, A7XSPAWN_spawned = nil, nil
  F.world()
  F.crowd()
  console()
end

local function matching(lines, pattern)
  local out = {}
  for _, l in ipairs(lines) do
    if l:match(pattern) then out[#out + 1] = l end
  end
  return out
end

T.test("the first run spawns every fixture through C, later runs spawn nothing", function()
  session()
  local lines = run()
  T.eq(table.concat(calls, " "), "COWH DRBOD DADROW8 SHFIRE", "spawn calls")
  T.eq(lines[1], 'A7XSPAWN\t{"kind":"spawn","ok":true,"resref":"COWH","run":1}', "spawn line")
  run()
  T.eq(#calls, 4, "no more calls on the second run")
  T.eq(shown:match("^A7X spawn check 2: spawned earlier, ") ~= nil, true, shown)
end)

T.test("the lines for a creature made from a fixture are the golden file", function()
  session()
  F.resref(F.C, "cowh")
  local lines = run()
  local want = {}
  for line in io.lines("test/fixtures/a7xspawn.txt") do want[#want + 1] = line end
  T.eq(#lines, #want, "line count")
  for i = 1, #want do T.eq(lines[i], want[i], "line " .. i) end
  T.eq(#matching(lines, '"kind":"creature"'), 1, "one fixture in the area")
  T.eq(#matching(lines, '"kind":"header"')[1]:match('"hex":"(%x+)"'), 2 * A7XOFF.sprite.cre_size,
    "the header as hex")
  T.eq(shown, "A7X spawn check 1: spawned 4, found 1 of 4, missing DRBOD DADROW8 SHFIRE " ..
    "(details in the session log)", "summary")
end)

T.test("a fixture in another area is not found", function()
  session()
  F.resref(F.D, "COWH") -- D is in the area not on screen
  run()
  T.eq(shown:match("found 0 of 4") ~= nil, true, shown)
end)

T.test("a spawn that raises is logged as failed and the run goes on", function()
  session()
  C = { CreateCreature = function(self, resref) error("no such creature") end }
  local lines = run()
  T.eq(lines[1]:match('^A7XSPAWN\t{"kind":"spawn","ok":false,"resref":"COWH","run":1,"why":".*no such creature"}$') ~= nil,
    true, lines[1])
  T.eq(shown:match("spawned 0, found 0 of 4") ~= nil, true, shown)
end)

T.test("without C the check cannot run, and nothing counts as spawned", function()
  session()
  C = nil
  local lines = run()
  T.eq(lines[1], 'A7XSPAWN\t{"kind":"error","run":1,"why":"no console object C"}', "error line")
  T.eq(shown, "A7X spawn check 1 could not run: no console object C", "summary")
  T.eq(A7XSPAWN_spawned, nil, "a later run may still spawn")
end)

T.done()
