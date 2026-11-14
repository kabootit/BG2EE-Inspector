-- a7xfmt.lua: a schema-1 record (docs/data-model.md) as lines for the message window.
--
--   [A7X] Fire Giant  HP 112/140  AC -1  THAC0 4  MR 0%
--         Saves D3 W5 P4 B4 S6  Resist fire 100
--
-- The name is colored by side with the engine's markup: "^0x", eight hex digits, the text, "^-"
-- (the binary formats it as ^%#010x%s^-). AC modifiers and resistances are listed only when not 0.

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

-- The record's lines, in order.
function A7XFMT.lines(r)
  local ac = tostring(r.ac)
  local mods = nonzero(r.ac_mods, AC_MODS, signed)
  if #mods > 0 then ac = ac .. " (" .. table.concat(mods, ", ") .. ")" end
  local resist = nonzero(r.resist, RESISTS, tostring)
  local s = r.saves
  return {
    string.format("[A7X] %s  HP %d/%d  AC %s  THAC0 %d  MR %d%%",
      colored(r.name, r.allegiance.side), r.hp.cur, r.hp.max, ac, r.thac0, r.mr),
    string.format("      Saves D%d W%d P%d B%d S%d  Resist %s",
      s.death, s.wand, s.poly, s.breath, s.spell, #resist > 0 and table.concat(resist, ", ") or "none"),
  }
end
