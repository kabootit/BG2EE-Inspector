-- The JSON writer (mod/inspector/lib/a7xjson.lua): key order, numbers, escapes, arrays and objects,
-- and the values it refuses without raising.

local T = dofile("test/lua/testlib.lua")
dofile("mod/inspector/lib/a7xjson.lua")
local J = A7XJSON.encode

T.test("object keys are sorted, so the output is the same every time", function()
  T.eq(J({ b = 1, a = 2, c = { z = true, y = false } }), '{"a":2,"b":1,"c":{"y":false,"z":true}}', "nested")
end)

T.test("whole numbers are integers, others round-trip", function()
  T.eq(J(42), "42", "integer")
  T.eq(J(-7), "-7", "negative")
  T.eq(J(2 ^ 52), "4503599627370496", "large integer")
  T.eq(J(0.5), "0.5", "fraction")
  T.eq(tonumber(J(0.1)), 0.1, "a fraction reads back the same")
end)

T.test("strings are escaped as RFC 8259 requires, and UTF-8 passes through", function()
  T.eq(J('say "hi"\\'), '"say \\"hi\\"\\\\"', "quote and backslash")
  T.eq(J("a\nb\tc\r"), '"a\\nb\\tc\\r"', "named escapes")
  T.eq(J("x\1y\127"), '"x\\u0001y\\u007f"', "other control characters")
  T.eq(J("Haer'Dalis Ã©"), '"Haer\'Dalis Ã©"', "UTF-8 bytes unchanged")
end)

T.test("1 to n is an array, no keys an empty array, anything else an object", function()
  T.eq(J({ 3, 1, 2 }), "[3,1,2]", "array in order")
  T.eq(J({}), "[]", "empty")
  T.eq(J({ { id = 1 }, { id = 2 } }), '[{"id":1},{"id":2}]', "array of objects")
  T.eq(J(nil), "null", "nil")
end)

T.test("values JSON cannot hold are refused with a reason, never raised", function()
  local function refused(v, why)
    local out, reason = J(v)
    T.eq(out, nil, why)
    T.eq(type(reason), "string", why .. ": a reason")
  end
  refused(function() end, "a function")
  refused(0 / 0, "NaN")
  refused(math.huge, "infinity")
  refused({ [1] = "a", x = "b" }, "mixed keys")
  refused({ [true] = 1 }, "a boolean key")
  local deep = {}
  local at = deep
  for _ = 1, 20 do at.next = {} at = at.next end
  refused(deep, "nested too deep")
  local loop = {}
  loop.self = loop
  refused(loop, "a cycle")
end)

T.done()
