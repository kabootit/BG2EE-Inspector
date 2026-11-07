-- The bridge manual test's script (test/lua/a7xt.lua) against a fake A7X_native, to check every
-- line it logs before it runs in the game. This is how its negative-number bug was found.

local T = dofile("test/lua/testlib.lua")

local logged
function Infinity_Log(s) logged[#logged + 1] = s end

local function run()
  logged = {}
  dofile("test/lua/a7xt.lua")
  return logged
end

local ROOT = 0x6000100
local function fake()
  return {
    Version = function() return 1, "2.7.3 arm64" end,
    Root = function() return ROOT end,
    Read = function(addr, kind)
      if addr == 16 then return end
      if kind == "ptr" then return 0x10074d0b8 end
      if kind == "u8" then return 0xb8 end
      if kind == "i32" then return -5 end
      if kind == "cstr" then return "x" end
    end,
    ReadBlock = function(addr, n)
      if addr == 16 then return end
      return string.rep("z", n)
    end,
  }
end

T.test("every check is logged with the run number, numbers in hex", function()
  A7XT_run = nil
  A7X_native = fake()
  local lines = run()
  local want = {
    "A7XT 1 native table", "A7XT 1 version 1 2.7.3 arm64", "A7XT 1 root 0x6000100",
    "A7XT 1 vtable 0x10074d0b8", "A7XT 1 u8 0xb8", "A7XT 1 i32 -0x5", "A7XT 1 cstr string",
    "A7XT 1 block 0x40", "A7XT 1 bad nil", "A7XT 1 badkind nil", "A7XT 1 badblock nil",
    "A7XT 1 done ok",
  }
  T.eq(#lines, #want, "line count")
  for i, line in ipairs(want) do T.eq(lines[i], line, "line " .. i) end
end)

T.test("a second run is numbered 2", function()
  T.eq(run()[1], "A7XT 2 native table")
end)

T.test("without A7X_native it logs that and stops", function()
  A7X_native = nil
  local lines = run()
  T.eq(#lines, 1, "line count")
  T.eq(lines[1], "A7XT 3 native nil")
end)

T.test("a missing function is logged as an error, not raised", function()
  A7X_native = { Version = function() return 1, "b" end }
  local lines = run()
  T.eq(lines[#lines]:match("^A7XT 4 done error ") ~= nil, true, "last line is an error")
end)

T.done()
