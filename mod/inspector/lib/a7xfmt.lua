-- a7xfmt.lua: a schema-1 record (docs/data-model.md) as lines for the message window.
--
--   [A7X] Fire Giant  HP 112/140  AC -1  THAC0 4  MR 0%
--         Saves D3 W5 P4 B4 S6  Resist fire 100
--         Spells Bless 34s, Haste 1m 42s
--
-- The name is colored by side with the engine's markup: "^0x", eight hex digits, the text, "^-"
-- (the binary formats it as ^%#010x%s^-). AC modifiers and resistances are listed only when not 0.
-- The spells line lists the record's effects in its order, soonest first, in game time; a record
-- without effects, when the inspector could not read them, has no spells line.

A7XFMT = {}

-- Colors by side, as 0xAABBGGRR: alpha, then blue, green and red. The Data API manual test of
-- 2026-11-14 settled the order: written as 0xAARRGGBB, light blue showed gold and red showed blue.
local COLORS = {
  party = 0xffffc080, -- light blue
  ally = 0xff60e060, -- green
  neutral = 0xffa0d0d0, -- pale yellow
  enemy = 0xff6060ff, -- red
}

local AC_MODS = { "crushing", "missile", "piercing", "slashing" }
local RESISTS = {
  "fire", "cold", "electricity", "acid", "magic_fire", "magic_cold",
  "slashing", "crushing", "piercing", "missile",
}

local function colored(text, side)
  local color = COLORS[side]
  if not color then return text end
  return string.format("^0x%08x%s^-", color, text)
end

local function signed(n)
  return n > 0 and "+" .. n or tostring(n)
end

-- The non-zero entries of `t`, in `order`, as "name value" joined with ", ".
local function nonzero(t, order, show)
  local out = {}
  for _, k in ipairs(order) do
    if t[k] ~= 0 then out[#out + 1] = k:gsub("_", " ") .. " " .. show(t[k]) end
  end
  return out
end

-- Game seconds as the countdown shows them: 34s, 1m 42s, 2h 5m. A local, as lines() calls it after
-- the API has cleared the global A7XFMT.
local function duration(seconds)
  if seconds < 60 then return seconds .. "s" end
  local floor = math.floor -- Lua 5.2: no // operator
  if seconds < 3600 then return string.format("%dm %ds", floor(seconds / 60), seconds % 60) end
  return string.format("%dh %dm", floor(seconds / 3600), floor(seconds % 3600 / 60))
end
A7XFMT.duration = duration

-- The record's lines, in order.
function A7XFMT.lines(r)
  local ac = tostring(r.ac)
  local mods = nonzero(r.ac_mods, AC_MODS, signed)
  if #mods > 0 then ac = ac .. " (" .. table.concat(mods, ", ") .. ")" end
  local resist = nonzero(r.resist, RESISTS, tostring)
  local s = r.saves
  local lines = {
    string.format("[A7X] %s  HP %d/%d  AC %s  THAC0 %d  MR %d%%",
      colored(r.name, r.allegiance.side), r.hp.cur, r.hp.max, ac, r.thac0, r.mr),
    string.format("      Saves D%d W%d P%d B%d S%d  Resist %s",
      s.death, s.wand, s.poly, s.breath, s.spell, #resist > 0 and table.concat(resist, ", ") or "none"),
  }
  if r.effects then
    local spells = {}
    for i, e in ipairs(r.effects) do spells[i] = e.name .. " " .. duration(e.seconds) end
    lines[#lines + 1] = "      Spells " .. (#spells > 0 and table.concat(spells, ", ") or "none")
  end
  return lines
end
