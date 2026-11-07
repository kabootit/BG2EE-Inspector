-- The party check (test/lua/a7xchk.lua) against the fake game and a fake characters[]: every field
-- of a member that agrees, a deliberate difference, a member whose record screen was never opened,
-- and the parse of the record screen's save text.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end

local SAVES_A = "Death: 10 (4)\nWands: 11 (0)\nPolymorph: 12 (0)\nBreath: 13 (0)\nSpells: 14 (7)\n"

local function engine_a()
  return {
    name = "Alarion",
    HP = { current = 40, max = 52 },
    AC = { current = -2, crushing = 0, missile = 1, piercing = 0, slashing = 0 },
    THAC0 = { current = 6 },
    savingThrows = SAVES_A,
  }
end

local function run()
  logged = {}
  dofile("test/lua/a7xchk.lua")
  return logged
end

local function lines_for(lines, id)
  local out = {}
  for _, l in ipairs(lines) do
    if l:match("^A7XCHECK %d+ " .. id .. " ") then out[#out + 1] = l end
  end
  return out
end

T.test("the save text gives five base and shown pairs in order", function()
  F.world()
  run()
  local p = A7XCHK_save_pairs(SAVES_A)
  T.eq(#p, 5, "pairs")
  T.eq(p[1][1], 10, "death base")
  T.eq(p[5][2], 7, "spell shown")
  T.eq(#A7XCHK_save_pairs("Death: -1 (-3)"), 1, "negative numbers")
  T.eq(#A7XCHK_save_pairs(nil), 0, "no text")
end)

T.test("a member whose values all agree is all ok, with a walker line after", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local lines = run()
  T.eq(lines[1], "A7XCHECK 2 party 2", "party line")
  local a = lines_for(lines, F.ID_A)
  T.eq(#a, 19, "compared fields") -- name, 2 hp, 5 ac, thac0, 5 x 2 saves
  for _, l in ipairs(a) do T.eq(l:match(" ok walker=") ~= nil, true, l) end
  T.eq(a[1], "A7XCHECK 2 " .. F.ID_A .. " name ok walker=Alarion | engine=Alarion", "name line")
  local walk
  for _, l in ipairs(lines) do if l:match("^A7XWALK 2 " .. F.ID_A) then walk = l end end
  T.eq(walk ~= nil and walk:match(" ea_a=2 ea_b=2 block=derived ") ~= nil, true, "walker line")
end)

T.test("a value that differs is a DIFF with both values", function()
  F.world()
  local e = engine_a()
  e.HP.max = 53
  characters = { [F.ID_A] = e }
  local found
  for _, l in ipairs(run()) do if l:match(" hp%.max ") then found = l end end
  T.eq(found, "A7XCHECK 3 " .. F.ID_A .. " hp.max DIFF walker=52 | engine=53", "diff line")
end)

T.test("a member not in characters[] is skipped as not populated", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local b = lines_for(run(), F.ID_B)
  T.eq(#b, 1, "one line")
  T.eq(b[1], "A7XCHECK 4 " .. F.ID_B .. " skip not-populated", "skip line")
end)

T.test("no game loaded is one error line", function()
  F.world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1], "A7XCHECK 5 party error no game loaded", "error line")
end)

T.done()
