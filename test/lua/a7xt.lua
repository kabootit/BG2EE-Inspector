-- a7xt.lua: the in-game half of docs/manual-tests/bridge.md.
--
-- Copied into the game's override/ folder for the test only, and removed after it. Typed in the
-- debug console as Infinity_DoFile("a7xt"), it calls each A7X_native function from the game's own
-- Lua and writes one "A7XT <run> <check> <value>" line per result to the session log through
-- Infinity_Log. Numbers are logged in hex (Lua 5.2's %x refuses negative numbers, so those are
-- written as -0x...). It only reads, like the functions it calls, and runs inside pcall, so a missing
-- function is logged rather than raised.

A7XT_run = (A7XT_run or 0) + 1
local run = A7XT_run

local function log(check, value)
  if type(value) == "number" then
    value = value < 0 and string.format("-0x%x", -value) or string.format("0x%x", value)
  end
  Infinity_Log("A7XT " .. run .. " " .. check .. " " .. tostring(value))
end

local N = A7X_native
log("native", type(N))
if type(N) ~= "table" then return end

local ok, err = pcall(function()
  log("version", table.concat({ N.Version() }, " "))
  local root = N.Root()
  log("root", root)
  log("vtable", root and N.Read(root, "ptr"))
  log("u8", root and N.Read(root, "u8"))
  log("i32", root and N.Read(root, "i32"))
  log("cstr", type((root and N.Read(root, "cstr"))))
  local block = root and N.ReadBlock(root, 64)
  log("block", block and #block)
  log("bad", N.Read(16, "u32"))
  log("badkind", root and N.Read(root, "u64"))
  log("badblock", N.ReadBlock(16, 64))
end)
log("done", ok and "ok" or ("error " .. tostring(err)))
