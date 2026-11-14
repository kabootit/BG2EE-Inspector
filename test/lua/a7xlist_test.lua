-- The creature list check (test/lua/a7xlist.lua) against the fake game with its crowd: its lines are
-- exactly the golden file test/fixtures/a7xlist.txt, which test/model/schemas_test.ts checks against
-- the schema; then a party member outside the area on screen, a creature without a name, no game,
-- and the summary line in the message window.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged, shown
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_DisplayString(s) shown = s end
os.clock = function() return 0 end -- the scan's time, so the lines are the same every run

local function run()
  logged, shown = {}, nil
  A7XLIST_run = nil -- every case is run 1, whatever ran before it
  dofile("test/lua/a7xlist.lua")
  return logged
end

local function golden()
  local lines = {}
  for line in io.lines("test/fixtures/a7xlist.txt") do lines[#lines + 1] = line end
  return lines
end

local function find(lines, fragment)
  for _, l in ipairs(lines) do
    if l:find(fragment, 1, true) then return l end
  end
end

T.test("the lines for the area on screen are the golden file, every check ok", function()
  F.world()
  F.crowd()
  local lines, want = run(), golden()
  T.eq(#lines, #want, "line count")
  for i = 1, #want do T.eq(lines[i], want[i], "line " .. i) end
  T.eq(shown, "A7X creature list 1: AR0602, 3 creatures (2 party, 1 hostile, 0 other), all checks ok " ..
    "(details in the session log)", "summary")
end)

T.test("a party member outside the area on screen is a check with ok false", function()
  F.world()
  F.crowd()
  F.field(F.B, A7XOFF.object.area, F.AREA2)
  local line = find(run(), '"name":"party.' .. F.ID_B .. '",')
  T.eq(line, 'A7XLIST\t{"detail":"not in the list","kind":"check","name":"party.' .. F.ID_B ..
    '","ok":false,"run":1}', "party check")
  T.eq(shown:match("1 of 6 checks differ") ~= nil, true, shown)
end)

T.test("a creature without a name is left without one, and the names check names its id", function()
  F.world()
  F.crowd()
  F.field(F.C, A7XOFF.sprite.name_strref, 9999)
  local lines = run()
  T.eq(find(lines, '"id":' .. F.ID_C .. ',"kind":"creature"'):find('"name"', 1, true), nil, "no name field")
  T.eq(find(lines, '"name":"names"'), 'A7XLIST\t{"detail":"no name: ' .. F.ID_C ..
    '","kind":"check","name":"names","ok":false,"run":1}', "names check")
end)

T.test("no game loaded is one error line and a could-not-run summary", function()
  F.world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1], 'A7XLIST\t{"kind":"error","run":1,"why":"no game loaded"}', "error line")
  T.eq(shown, "A7X creature list 1 could not run: no game loaded", "summary")
end)

T.done()
