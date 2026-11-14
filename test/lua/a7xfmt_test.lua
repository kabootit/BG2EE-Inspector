-- The formatter (mod/inspector/lib/a7xfmt.lua): a record's two message-window lines, the name
-- colored by side, and AC modifiers and resistances listed only when not 0.

local T = dofile("test/lua/testlib.lua")
dofile("mod/inspector/lib/a7xfmt.lua")

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
  local lines = A7XFMT.lines(record())
  T.eq(#lines, 2, "two lines")
  T.eq(lines[1], "[A7X] ^0xffff6060Fire Giant^-  HP 112/140  AC -1  THAC0 4  MR 0%", "header")
  T.eq(lines[2], "      Saves D3 W5 P4 B4 S6  Resist fire 100", "saves and resistances")
end)

T.test("each side has its own color", function()
  local function color(side)
    return A7XFMT.lines(record({ allegiance = { ea = 0, side = side } }))[1]:match("%^0x(" .. ("%x"):rep(8) .. ")")
  end
  T.eq(color("party") .. " " .. color("ally") .. " " .. color("neutral"), "ff80c0ff ff60e060 ffd0d0a0", "colors")
end)

T.test("only non-zero AC modifiers and resistances are listed, with their signs", function()
  local lines = A7XFMT.lines(record({
    ac_mods = { crushing = 2, missile = 0, piercing = -1, slashing = 0 },
    resist = {
      fire = 0, cold = 0, electricity = 0, acid = -25, magic_fire = 50, magic_cold = 0,
      slashing = 0, crushing = 0, piercing = 0, missile = 0,
    },
  }))
  T.eq(lines[1]:match("AC (.-)  THAC0"), "-1 (crushing +2, piercing -1)", "AC modifiers")
  T.eq(lines[2]:match("Resist (.*)$"), "acid -25, magic fire 50", "resistances, underscores as spaces")
  local none = A7XFMT.lines(record({ resist = {
    fire = 0, cold = 0, electricity = 0, acid = 0, magic_fire = 0, magic_cold = 0,
    slashing = 0, crushing = 0, piercing = 0, missile = 0,
  } }))
  T.eq(none[2]:match("Resist (.*)$"), "none", "no resistances")
end)

T.done()
