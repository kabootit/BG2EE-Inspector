-- The public API (mod/inspector/lib/a7xapi.lua, loaded through a7x.lua) on the fake game with its
-- crowd: the native table taken private, status in each state, get, list, hovered, portrait and show,
-- the records' active spells, the A7XDATA lines against the golden file shared with the Deno tests,
-- fresh tables, and no raise on failure.

local T = dofile("test/lua/testlib.lua")
local F = dofile("test/lua/fakegame.lua")
local NATIVE = A7X_native
local O = A7XOFF -- kept here: loading the API clears the global

local said, logged
function Infinity_DoFile(name) dofile("mod/inspector/lib/" .. name .. ".lua") end
function Infinity_Log(s) logged[#logged + 1] = s end
function Infinity_DisplayString(s) said[#said + 1] = s end

-- A's timed effects: Bless, 36 seconds left, with its 2-second visual effect a tick past its expiry
-- and still listed; 100 ticks of a source the names table lacks; a permanent ability.
local A_EFFECTS = {
  { opcode = 142, p2 = 17, timing = 4096, duration = F.TIME + 540, source = "SPPR101" },
  { opcode = 215, timing = 4096, duration = F.TIME - 1, source = "SPPR101" },
  { opcode = 142, p2 = 37, timing = 4096, duration = F.TIME + 100, source = "FJBARDB" },
  { opcode = 0, timing = 9, source = "SPCL234" },
}

-- A fresh load, as at the start of a session: the library has registered its table, and ui.menu has
-- loaded the names table (a7xnames.lua) first.
local function load()
  said, logged = {}, {}
  A7X, A7X_native = nil, NATIVE
  A7XNAMES = { SPPR101 = 12089, SPCL234 = 99999 }
  mouseOverPortrait = nil -- ui.menu's, set while the pointer is over a portrait
  F.world()
  F.crowd()
  F.effects(F.A, "timed", A_EFFECTS)
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
  T.eq(A7XNAMES, nil, "the names table kept private too")
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

T.test("a second load keeps the first API, before a call and after one", function()
  load()
  local first = A7X
  dofile("mod/inspector/lib/a7x.lua")
  T.eq(A7X, first, "before a call: the same table")
  T.eq(A7X.status(), "ok", "the first call takes the table")
  dofile("mod/inspector/lib/a7x.lua")
  T.eq(A7X, first, "after a call: the same table")
  T.eq(A7X.status(), "ok", "still ok, from the first API's private copy")
  T.eq(A7XOFF == nil and A7XWALK == nil, true, "no module loaded again")
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
  T.eq(v.api .. " " .. v.schema .. " " .. v.build, "1.1 1 2.7.3 arm64", "version")
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

T.test("a record's effects: each spell once, by name, its latest expiry in game seconds, soonest first", function()
  load()
  local a = assert(A7X.get(F.ID_A))
  T.eq(#a.effects, 2, "Bless and the nameless source; the permanent ability left out")
  local first, second = a.effects[1], a.effects[2]
  T.eq(first.resref .. " " .. first.name .. " " .. first.seconds, "FJBARDB FJBARDB 7",
    "100 ticks rounds up to 7 seconds; no name in the table, so the resref")
  T.eq(second.resref .. " " .. second.name .. " " .. second.seconds, "SPPR101 Bless 36",
    "Bless by its icon effect, not its expired visual effect")
  T.eq(#assert(A7X.get(F.ID_B)).effects, 0, "nothing active: an empty list")
  T.eq(#assert(A7X.get(F.ID_C)).effects, 0, "an enemy's record has effects too")
end)

T.test("effects are missing, not empty, when the list or the clock cannot be read", function()
  load()
  F.field(F.A, O.sprite.timed_effects, 0x10) -- a node pointing nowhere
  local a = assert(A7X.get(F.ID_A))
  T.eq(a.effects, nil, "an unreadable list")
  T.eq(a.name, "Alarion", "the rest of the record still returns")
  load()
  local read = NATIVE.Read
  NATIVE.Read = function(addr, kind)
    if addr == F.GAME + O.game.time[1] then return nil end
    return read(addr, kind)
  end
  T.eq(assert(A7X.get(F.ID_A)).effects, nil, "an unreadable clock")
  NATIVE.Read = read
end)

T.test("without the names table, a spell shows its resref", function()
  load()
  A7X = nil
  A7XNAMES = nil
  dofile("mod/inspector/lib/a7x.lua")
  A7X_native = NATIVE
  T.eq(assert(A7X.get(F.ID_A)).effects[2].name, "SPPR101", "no a7xnames.lua: Infinity_DoFile(\"a7x\") alone")
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
  local want, data = golden(), {}
  for _, l in ipairs(logged) do if l:find("^A7XDATA\t") then data[#data + 1] = l end end
  T.eq(#data, #want, "one A7XDATA line per record")
  for i = 1, #want do T.eq(data[i], want[i], "A7XDATA line " .. i) end
  T.eq(#said, 10, "three message-window lines per record, then the summary")
  T.eq(said[3], "      Spells FJBARDB 7s, Bless 36s", "the party member's spells")
  T.eq(said[7], "[A7X] ^0xff6060ffOgre^-  HP 60/60  AC 0  THAC0 0  MR 0%", "the enemy's first line")
  T.eq(said[9], "      Spells none", "the enemy's spells")
  T.eq(said[10], "[A7X] all in AR0602: 3 shown, 0 not readable", "the summary")
end)

T.test("every message-window line is in the session log too", function()
  load()
  A7X.show("enemies")
  A7X.show(12345)
  local text = {}
  for _, l in ipairs(logged) do if not l:find("^A7XDATA\t") then text[#text + 1] = l end end
  T.eq(table.concat(text, "|"), table.concat(said, "|"), "the same lines, in order")
end)

T.test("a creature that raises is reported and the others are still shown", function()
  load()
  A7X.status()
  local read = NATIVE.Read
  NATIVE.Read = function(addr, kind)
    if addr == F.B + O.sprite.hp[1] then error("boom") end
    return read(addr, kind)
  end
  A7X.show("all")
  NATIVE.Read = read
  local data = 0
  for _, l in ipairs(logged) do if l:find("^A7XDATA\t") then data = data + 1 end end
  T.eq(data, 2, "A and C shown")
  T.eq(said[#said], "[A7X] all in AR0602: 2 shown, 1 not readable", "the summary counts it")
  local reported = false
  for _, l in ipairs(said) do if l:find("^%[A7X%] " .. F.ID_B .. ": .*boom") then reported = true end end
  T.eq(reported, true, "B's reason")
end)

T.test("show explains instead of printing nothing", function()
  load()
  A7X.show()
  T.eq(said[1]:match("^%[A7X%] point at a creature or a portrait, or A7X%.show%(id%)") ~= nil, true,
    "usage with no argument and nothing under the pointer")
  F.field(F.C, O.object.ea, 128) -- the Ogre turns neutral: no enemies left
  A7X.show("enemies")
  T.eq(said[2], "[A7X] no enemies in AR0602", "an empty list")
  A7X.show(12345)
  T.eq(said[3], "[A7X] 12345: stale id", "a bad id")
end)

T.test("hovered gives the record of the creature under the pointer, or why there is none", function()
  load()
  F.field(F.AREA1, O.area.picked, F.ID_C)
  local c = assert(A7X.hovered())
  T.eq(c.name .. " " .. c.allegiance.side, "Ogre enemy", "the Ogre")
  F.field(F.AREA1, O.area.picked, -1)
  T.eq(select(2, A7X.hovered()), "nothing under the pointer", "nothing")
  F.field(F.AREA1, O.area.picked, F.ID_E)
  T.eq(select(2, A7X.hovered()), "not a creature", "a door or container")
end)

T.test("portrait gives the party member in the portrait's slot, or why there is none", function()
  load()
  mouseOverPortrait = 0
  T.eq(assert(A7X.portrait()).name, "Alarion", "slot 0")
  mouseOverPortrait = 1
  T.eq(assert(A7X.portrait()).name, "Jaheira", "slot 1")
  mouseOverPortrait = 4
  T.eq(select(2, A7X.portrait()), "no party member in slot 4", "an empty slot")
  mouseOverPortrait = -1
  T.eq(select(2, A7X.portrait()), "no portrait under the pointer", "-1 as the pointer leaves")
  mouseOverPortrait = nil
  T.eq(select(2, A7X.portrait()), "no portrait under the pointer", "no global, as before ui.menu")
end)

T.test("show with no argument shows the portrait, else the creature, else usage or the reason", function()
  load()
  mouseOverPortrait = 1
  F.field(F.AREA1, O.area.picked, F.ID_C)
  A7X.show()
  T.eq(said[1]:find("Jaheira", 1, true) ~= nil, true, "the portrait first: " .. said[1])
  T.eq(logged[#logged]:find('^A7XDATA\t.*"name":"Jaheira"') ~= nil, true, "its A7XDATA line")
  mouseOverPortrait = -1
  A7X.show()
  T.eq(said[4]:find("Ogre", 1, true) ~= nil, true, "then the creature: " .. said[4])
  F.field(F.AREA1, O.area.picked, F.ID_E)
  A7X.show()
  T.eq(said[7], "[A7X] not a creature", "what is there cannot be shown")
  F.field(F.AREA1, O.area.picked, -1)
  A7X.show()
  T.eq(said[8]:match("^%[A7X%] point at") ~= nil, true, "usage over empty ground")
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
