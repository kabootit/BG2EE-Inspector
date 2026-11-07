-- The walker (mod/inspector/lib/a7xwalk.lua) against a fake game in a Lua table of bytes: a party of
-- two, one on each stats block, a custom name and a strref name, an empty weapon slot, improved
-- invisibility, and the hostile cases (bad counts, stale ids, wrong types, unreadable pointers).

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua") -- loads a7xoff.lua, which the walker reads at load
dofile("mod/inspector/lib/a7xwalk.lua")
local O = A7XOFF
local ROOT, GAME, ARRAY, A, B, ID_A, ID_B = F.ROOT, F.GAME, F.ARRAY, F.A, F.B, F.ID_A, F.ID_B
local field, world = F.field, F.world

T.test("the party is found in slot order through the object array", function()
  world()
  local party = assert(A7XWALK.party())
  T.eq(#party, 2, "party size")
  T.eq(party[1].id, ID_A, "first id")
  T.eq(party[1].sprite, A, "first sprite")
  T.eq(party[2].sprite, B, "second sprite")
end)

T.test("a creature on the derived block, with a custom name and a weapon", function()
  world()
  local c = assert(A7XWALK.creature(A))
  T.eq(c.name, "Alarion", "name")
  T.eq(c.stats_block, "derived", "block")
  T.eq(c.hp.cur, 40, "hp")
  T.eq(c.hp.max, 52, "max hp")
  T.eq(c.ac.value, -2, "ac")
  T.eq(c.ac.missile, 1, "missile ac")
  T.eq(c.thac0, 9, "thac0")
  T.eq(c.thac0_shown, 9 - 2 - 1, "thac0 shown")
  T.eq(c.saves.death, 4, "death save")
  T.eq(c.saves_base.spell, 14, "base spell save")
  T.eq(c.saves_shown.spell, 7, "shown spell save")
  T.eq(c.resist.fire, 25, "fire resistance")
  T.eq(c.mr, 10, "magic resistance")
  T.eq(c.ea.a, 2, "ea")
end)

T.test("a creature on the temp block, with a strref name, no weapon, improved invisibility", function()
  world()
  local c = assert(A7XWALK.creature(B))
  T.eq(c.name, "Jaheira", "name")
  T.eq(c.stats_block, "temp", "block")
  T.eq(c.hp.max, 30, "max hp from temp")
  T.eq(c.saves.death, 6, "death save from temp")
  T.eq(c.thac0_shown, 0, "thac0 shown with an empty weapon slot")
  T.eq(c.saves_shown.death, 8 - 4, "shown save: derived, 4 better under improved invisibility")
end)

T.test("a party count out of range is refused", function()
  world()
  field(GAME, O.game.party_count, 99)
  local party, why = A7XWALK.party()
  T.eq(party, nil, "party")
  T.eq(why, "bad party count", "reason")
end)

T.test("a stale, foreign or out-of-range id finds nothing", function()
  world()
  T.eq(select(2, A7XWALK.lookup(5 * 65536 + 1999)), "stale id", "stale")
  T.eq(select(2, A7XWALK.lookup(7 * 65536 + 2001)), "stale id", "empty slot's generation")
  T.eq(select(2, A7XWALK.lookup(50 * 65536)), "id outside the array", "past highest")
  T.eq(select(2, A7XWALK.lookup(-1)), "bad id", "negative")
  field(ARRAY, O.objects.highest, 200)
  T.eq(select(2, A7XWALK.lookup(150 * 65536)), "id outside the array", "past capacity")
end)

T.test("a wrong type byte, a null or -1 pointer, and no game are refused", function()
  world()
  field(A, O.object.type, 0x10)
  T.eq(select(2, A7XWALK.creature(A)), "not a sprite", "type")
  T.eq(select(2, A7XWALK.creature(0)), "bad sprite pointer", "null")
  T.eq(select(2, A7XWALK.creature(2 ^ 64 - 1)), "bad sprite pointer", "-1 as unsigned")
  T.eq(select(2, A7XWALK.creature(0x900000)), "not a sprite", "unmapped")
  field(ROOT, O.chitin.game, 0)
  T.eq(select(2, A7XWALK.party()), "no game loaded", "no game")
end)

T.test("without A7X_native every function says so", function()
  local saved = A7X_native
  A7X_native = nil
  T.eq(select(2, A7XWALK.party()), "no A7X_native", "party")
  T.eq(select(2, A7XWALK.lookup(ID_A)), "no A7X_native", "lookup")
  A7X_native = saved
end)

T.done()
