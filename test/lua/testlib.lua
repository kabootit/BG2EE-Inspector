-- testlib.lua: the few assertions the Lua tests use, for stock Lua 5.2.4 (deno task test:lua).
-- Each test file loads it with dofile, calls T.test for each case, and ends with T.done().

local T = { passed = 0, failed = 0 }

function T.test(name, fn)
  local ok, err = pcall(fn)
  if ok then
    T.passed = T.passed + 1
    print("ok   " .. name)
  else
    T.failed = T.failed + 1
    print("FAIL " .. name .. ": " .. tostring(err))
  end
end

function T.eq(got, want, what)
  if got ~= want then
    error(string.format("%s: got %s, want %s", what or "value", tostring(got), tostring(want)), 2)
  end
end

function T.done()
  print(string.format("%d passed, %d failed", T.passed, T.failed))
  os.exit(T.failed == 0 and 0 or 1)
end

return T
