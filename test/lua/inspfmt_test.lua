-- The formatter (mod/inspector/lib/inspfmt.lua): a record's message-window lines, the name colored by
-- side, AC modifiers and resistances listed only when not 0, and the spells line with game time.

local T = dofile("test/lua/testlib.lua")
dofile("mod/inspector/lib/inspfmt.lua")

local function record(changes)
  local r = {
    schema = 1, id = 1, resref = "GIANTF", name = "Fire Giant",
    allegiance = { ea = 255, side = "enemy" },
    hp = { cur = 112, max = 140 }, ac = -1,
    ac_mods = { crushing = 0, missile = 0, piercing = 0, slashing = 0 },
    thac0 = 4, mr = 0,
    saves = { death = 3, wand = 5, poly = 4, breath = 4, spell = 6 },
    resist = {
      fire = 100, cold = 0, electricity = 0, acid = 0, magic_fire = 0, magic_cold = 0,
      slashing = 0, crushing = 0, piercing = 0, missile = 0,
    },
  }
  for k, v in pairs(changes or {}) do r[k] = v end
  return r
end

T.test("a record is a header line and a saves and resistances line", function()
  local lines = INSPECTOR_FMT.lines(record())
  T.eq(#lines, 2, "two lines")
  T.eq(lines[1], "[Inspector] ^0xff6060ffFire Giant^-  HP 112/140  AC -1  THAC0 4  MR 0%", "header")
  T.eq(lines[2], "      Saves D3 W5 P4 B4 S6  Resist fire 100", "saves and resistances")
end)

T.test("each side has its own color", function()
  local function color(side)
    return INSPECTOR_FMT.lines(record({ allegiance = { ea = 0, side = side } }))[1]:match("%^0x(" .. ("%x"):rep(8) .. ")")
  end
  T.eq(color("party") .. " " .. color("ally") .. " " .. color("neutral"), "ffffc080 ff60e060 ffa0d0d0", "colors")
end)

T.test("only non-zero AC modifiers and resistances are listed, with their signs", function()
  local lines = INSPECTOR_FMT.lines(record({
    ac_mods = { crushing = 2, missile = 0, piercing = -1, slashing = 0 },
    resist = {
      fire = 0, cold = 0, electricity = 0, acid = -25, magic_fire = 50, magic_cold = 0,
      slashing = 0, crushing = 0, piercing = 0, missile = 0,
    },
  }))
  T.eq(lines[1]:match("AC (.-)  THAC0"), "-1 (crushing +2, piercing -1)", "AC modifiers")
  T.eq(lines[2]:match("Resist (.*)$"), "acid -25, magic fire 50", "resistances, underscores as spaces")
  local none = INSPECTOR_FMT.lines(record({ resist = {
    fire = 0, cold = 0, electricity = 0, acid = 0, magic_fire = 0, magic_cold = 0,
    slashing = 0, crushing = 0, piercing = 0, missile = 0,
  } }))
  T.eq(none[2]:match("Resist (.*)$"), "none", "no resistances")
end)

T.test("the spells line lists each spell with its time left, in the record's order", function()
  local lines = INSPECTOR_FMT.lines(record({ effects = {
    { resref = "FJBARDB", name = "FJBARDB", seconds = 6 },
    { resref = "SPPR101", name = "Bless", seconds = 34 },
    { resref = "SPWI305", name = "Haste", seconds = 102 },
  } }))
  T.eq(#lines, 3, "three lines")
  T.eq(lines[3], "      Spells FJBARDB 6s, Bless 34s, Haste 1m 42s", "the spells")
  T.eq(INSPECTOR_FMT.lines(record({ effects = {} }))[3], "      Spells none", "nothing active")
  T.eq(#INSPECTOR_FMT.lines(record()), 2, "effects unread: no spells line")
end)

T.test("game time as the countdown shows it", function()
  T.eq(INSPECTOR_FMT.duration(0), "0s", "expired, still listed")
  T.eq(INSPECTOR_FMT.duration(59), "59s", "under a minute")
  T.eq(INSPECTOR_FMT.duration(60), "1m 0s", "a minute")
  T.eq(INSPECTOR_FMT.duration(3599), "59m 59s", "under an hour")
  T.eq(INSPECTOR_FMT.duration(7500), "2h 5m", "hours and minutes")
end)

T.done()
