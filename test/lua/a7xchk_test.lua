-- The party check (test/lua/a7xchk.lua) against the fake game and a fake characters[]: every field
-- of a member that agrees, a deliberate difference, a member whose record screen was never opened,
-- and the parse of the record screen's save text.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")

local logged
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end

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

local function lines_for(lines, id)
  local out = {}
  for _, l in ipairs(lines) do
    if l:match("^A7XCHECK %d+ " .. id .. " ") then out[#out + 1] = l end
  end
  return out
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

T.test("a member whose values all agree is all ok, with a walker line after", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local lines = run()
  T.eq(lines[1], "A7XCHECK 1 party 2", "party line")
  local a = lines_for(lines, F.ID_A)
  T.eq(#a, 20, "compared fields") -- name, 2 hp, 5 ac, thac0, ea, 5 x 2 saves
  for _, l in ipairs(a) do T.eq(l:match(" ok walker=") ~= nil, true, l) end
  T.eq(a[1], "A7XCHECK 1 " .. F.ID_A .. " name ok walker=Alarion | engine=Alarion", "name line")
  local walk
  for _, l in ipairs(lines) do if l:match("^A7XWALK 1 " .. F.ID_A .. " block=") then walk = l end end
  T.eq(walk ~= nil and walk:match(" block=derived state=0 ") ~= nil, true, "walker line")
  local dump
  for _, l in ipairs(lines) do if l:match("^A7XDUMP 1 " .. F.ID_A .. " ") then dump = l end end
  local bytes = dump and dump:match(" (%S+)$")
  T.eq(bytes and #bytes, 4096, "2048 dumped bytes as hex")
  T.eq(bytes:sub(2 * 0x8 + 1, 2 * 0x8 + 2), "31", "the type byte in the dump")
end)

T.test("the keys of characters[id] and the save text are logged as evidence", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local keys, text
  for _, l in ipairs(run()) do
    keys = keys or l:match("^A7XWALK %d+ " .. F.ID_A .. " keys=(.*)$")
    text = text or l:match("^A7XWALK %d+ " .. F.ID_A .. " savingThrows=(.*)$")
  end
  T.eq(keys, "AC,HP,THAC0,name,proficiencies", "keys")
  T.eq(text, "string " .. SAVES_A:gsub("\n", "\\n"), "text, newlines escaped")
end)

T.test("a value that differs is a DIFF with both values", function()
  F.world()
  local e = engine_a()
  e.HP.max = 53
  characters = { [F.ID_A] = e }
  local found
  for _, l in ipairs(run()) do if l:match(" hp%.max ") then found = l end end
  T.eq(found, "A7XCHECK 1 " .. F.ID_A .. " hp.max DIFF walker=52 | engine=53", "diff line")
end)

T.test("a member not in characters[] is skipped as not populated", function()
  F.world()
  characters = { [F.ID_A] = engine_a() }
  local b = lines_for(run(), F.ID_B)
  T.eq(#b, 1, "one line")
  T.eq(b[1], "A7XCHECK 1 " .. F.ID_B .. " skip not-populated", "skip line")
end)

T.test("no game loaded is one error line", function()
  F.world()
  F.field(F.ROOT, A7XOFF.chitin.game, 0)
  local lines = run()
  T.eq(#lines, 1, "one line")
  T.eq(lines[1], "A7XCHECK 1 party error no game loaded", "error line")
end)

T.done()
