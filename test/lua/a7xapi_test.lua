-- The public API (mod/inspector/lib/a7xapi.lua, loaded through a7x.lua) on the fake game with its
-- crowd: the native table taken private, status in each state, get, list and show, the A7XDATA lines
-- against the golden file shared with the Deno tests, fresh tables, and no raise on failure.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")
local NATIVE = A7X_native
local O = A7XOFF -- kept here: loading the API clears the global

local said, logged
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DisplayString(s) said[#said + 1] = s end

-- A fresh load, as at the start of a session: the library has registered its table.
local function load()
  said, logged = {}, {}
  A7X, A7X_native = nil, NATIVE
  F.world()
  F.crowd()
  dofile("mod/inspector/lib/a7x.lua")
end

local function golden()
  local lines = {}
  for line in io.lines("test/fixtures/a7xdata.txt") do lines[#lines + 1] = line end
  return lines
end

T.test("loading leaves A7X as the only global, and the first call takes the native table", function()
  load()
  T.eq(A7XOFF == nil and A7XWALK == nil and A7XJSON == nil and A7XFMT == nil, true, "modules cleared")
  T.eq(A7X_native, NATIVE, "not taken before a call")
  T.eq(A7X.status(), "ok", "status")
  T.eq(A7X_native, nil, "taken by the first call")
  T.eq(A7X.status(), "ok", "still ok from the private copy")
end)

T.test("the API loaded before the library registers waits for it", function()
  said, logged = {}, {}
  A7X, A7X_native = nil, nil
  F.world()
  dofile("mod/inspector/lib/a7x.lua")
  T.eq(A7X.status(), "no_native", "nothing registered yet")
  T.eq(select(2, A7X.get(F.ID_A)), "no_native", "get says why")
  A7X_native = NATIVE
  T.eq(A7X.status(), "ok", "registered later")
end)

T.test("status is loading with no game or no area on screen", function()
  load()
  F.field(F.GAME, O.game.visible_area, O.game.area_count)
  T.eq(A7X.status(), "loading", "no area on screen")
  F.field(F.ROOT, O.chitin.game, 0)
  T.eq(A7X.status(), "loading", "no game")
end)

T.test("version names the API, the schema and the build", function()
  load()
  local v = A7X.version()
  T.eq(v.api .. " " .. v.schema .. " " .. v.build, "1.0 1 2.7.3 arm64", "version")
end)

T.test("get gives a record of every schema-1 field for a party member and an enemy", function()
  load()
  local a = assert(A7X.get(F.ID_A))
  T.eq(a.schema, 1, "schema")
  T.eq(a.name .. " " .. a.resref, "Alarion ALARION", "name and resref")
  T.eq(a.allegiance.side .. " " .. a.allegiance.ea, "party 2", "allegiance")
  T.eq(a.hp.cur .. "/" .. a.hp.max, "40/52", "hp")
  T.eq(a.ac_mods.missile, 1, "an AC modifier")
  T.eq(a.saves.spell, 7, "a save")
  T.eq(a.resist.fire, 25, "a resistance")
  local c = assert(A7X.get(F.ID_C))
  T.eq(c.allegiance.side, "enemy", "EA 255 is an enemy")
  T.eq(select(2, A7X.get(12345)), "stale id", "an id that is no creature")
  T.eq(select(2, A7X.get("x")), "not an id: x", "not a number")
end)

T.test("every call returns fresh tables", function()
  load()
  local first = A7X.get(F.ID_A)
  first.hp.cur = 0
  first.name = "changed"
  local again = A7X.get(F.ID_A)
  T.eq(again.hp.cur .. " " .. again.name, "40 Alarion", "unchanged by the caller's edits")
end)

T.test("list gives the creatures in the area on screen, by filter, without sprite addresses", function()
  load()
  local all = assert(A7X.list())
  T.eq(all.area, "AR0602", "area")
  T.eq(#all.creatures, 3, "A, B and C; D is in another area")
  T.eq(all.creatures[1].sprite, nil, "no address")
  T.eq(#A7X.list("party").creatures, 2, "party")
  local enemies = A7X.list("enemies").creatures
  T.eq(#enemies .. " " .. enemies[1].name .. " " .. enemies[1].allegiance.side, "1 Ogre enemy", "enemies")
  T.eq(select(2, A7X.list("friends")), "unknown filter: friends", "unknown filter")
end)

T.test("show prints each record and logs the golden A7XDATA lines", function()
  load()
  A7X.show("all")
  local want = golden()
  T.eq(#logged, #want, "one line per record")
  for i = 1, #want do T.eq(logged[i], want[i], "A7XDATA line " .. i) end
  T.eq(#said, 6, "two message-window lines per record")
  T.eq(said[5], "[A7X] ^0xffff6060Ogre^-  HP 60/60  AC 0  THAC0 0  MR 0%", "the enemy's first line")
end)

T.test("show explains instead of printing nothing", function()
  load()
  A7X.show()
  T.eq(said[1]:match("^%[A7X%] A7X%.show%(id%)") ~= nil, true, "usage with no argument")
  F.field(F.C, O.object.ea, 128) -- the Ogre turns neutral: no enemies left
  A7X.show("enemies")
  T.eq(said[2], "[A7X] no enemies in AR0602", "an empty list")
  A7X.show(12345)
  T.eq(said[3], "[A7X] 12345: stale id", "a bad id")
end)

T.test("a creature whose fields cannot be read gives a reason, never a partial record", function()
  load()
  F.field(F.A, O.sprite.name_strref, 999) -- a name the game's string table does not have
  local r, why = A7X.get(F.ID_A)
  T.eq(r, nil, "no record")
  T.eq(why, "unreadable: name", "the field")
end)

T.test("a failure inside the API is returned, not raised", function()
  load()
  A7X.status()
  NATIVE.Root = function() error("boom") end
  local r, why = A7X.get(F.ID_A)
  T.eq(r, nil, "no record")
  T.eq(why:match("^error: .*boom") ~= nil, true, why)
  A7X.show("all")
  T.eq(said[#said]:match("^%[A7X%] .*boom") ~= nil, true, said[#said])
  NATIVE.Root = function() return F.ROOT end
end)

T.done()
