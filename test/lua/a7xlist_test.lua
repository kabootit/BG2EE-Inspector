-- The creature list check (test/lua/a7xlist.lua) against the fake game with its crowd: every check
-- ok, a party member outside the area on screen, a creature without a name, no game, and the summary
-- line in the message window.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged, shown
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_DisplayString(s) shown = s end

local function run()
  logged, shown = {}, nil
  A7XLIST_run = nil -- every case is run 1, whatever ran before it
  dofile("test/lua/a7xlist.lua")
  return logged
end

local function matching(lines, pattern)
  local out = {}
  for _, l in ipairs(lines) do
    if l:match(pattern) then out[#out + 1] = l end
  end
  return out
end

T.test("the creatures in the area on screen, with every check ok", function()
  F.world()
  F.crowd()
  local lines = run()
  T.eq(lines[1], "A7XLIST 1 area index=0 resref=AR0602", "area line")
  T.eq(lines[2]:match("^A7XLIST 1 scan slots=301 objects=5 sprites=4 listed=3 ms=%S+$") ~= nil, true, lines[2])
  local creatures = matching(lines, "^A7XLIST 1 creature ")
  T.eq(#creatures, 3, "creature lines")
  T.eq(creatures[1], "A7XLIST 1 creature " .. F.ID_A ..
    " ea=2 group=friendly party=yes hp=40/52 state=0x0 name=Alarion", "a party member")
  T.eq(creatures[3], "A7XLIST 1 creature " .. F.ID_C ..
    " ea=255 group=hostile party=no hp=60/60 state=0x0 name=Ogre", "a hostile creature")
  local checks = matching(lines, "^A7XLIST 1 check ")
  T.eq(#checks, 7, "two per party member, then unique, lookup and names")
  for _, l in ipairs(checks) do T.eq(l:match(" ok ") ~= nil, true, l) end
  T.eq(shown, "A7X creature list 1: AR0602, 3 creatures (2 party, 1 hostile, 0 other), all checks ok " ..
    "(details in the session log)", "summary")
end)

T.test("a party member outside the area on screen is a DIFF", function()
  F.world()
  F.crowd()
  F.field(F.B, A7XOFF.object.area, F.AREA2)
  local lines = run()
  T.eq(matching(lines, " check party%." .. F.ID_B .. " ")[1],
    "A7XLIST 1 check party." .. F.ID_B .. " DIFF not in the list", "party check")
  T.eq(shown:match("1 of 6 checks differ") ~= nil, true, shown)
end)

T.test("a creature without a name is a DIFF naming its id", function()
  F.world()
  F.crowd()
  F.field(F.C, A7XOFF.sprite.name_strref, 9999)
  local names = matching(run(), " check names ")[1]
  T.eq(names, "A7XLIST 1 check names DIFF no name: " .. F.ID_C, "names check")
end)

T.test("no game loaded is one error line and a could-not-run summary", function()
  F.world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1], "A7XLIST 1 error no game loaded", "error line")
  T.eq(shown, "A7X creature list 1 could not run: no game loaded", "summary")
end)

T.done()
