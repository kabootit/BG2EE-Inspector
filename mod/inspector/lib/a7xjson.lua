-- a7xjson.lua: an encode-only JSON writer for every line the inspector writes: the A7XDATA record and
-- the checks' lines, each defined by a schema in src/model/schemas.ts.
--
-- Written for this project rather than vendored: the output must be deterministic, so object keys
-- are sorted, and nothing else is needed. Numbers that are whole are written as integers; strings
-- are escaped as RFC 8259 requires and passed through otherwise, the game's text being UTF-8. A
-- table whose keys are exactly 1 to n is an array, any other table an object with string keys, and a
-- table with no keys an empty array. Functions, userdata, NaN, infinities, non-string object keys and
-- tables nested more than 16 deep are refused: A7XJSON.encode returns nil and the reason, and never
-- raises. A fraction is written in 14 significant digits when that reads back exactly, so 0.7 is
-- 0.7, and in 17 otherwise.

-- Functions refer to the module through the local M: the API clears the global A7XJSON after loading.
local M = {}
A7XJSON = M

local MAX_DEPTH = 16
local ESCAPES = {
  ['"'] = '\\"', ["\\"] = "\\\\", ["\b"] = "\\b", ["\f"] = "\\f",
  ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t",
}

local function quote(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return ESCAPES[c] or string.format("\\u%04x", c:byte())
  end) .. '"'
end

local function number(n)
  if n ~= n or n == math.huge or n == -math.huge then error("not a finite number", 0) end
  if n == math.floor(n) and math.abs(n) < 2 ^ 53 then return string.format("%d", n) end
  local short = string.format("%.14g", n)
  return tonumber(short) == n and short or string.format("%.17g", n)
end

local encode

-- 1 to n with nothing else (n > 0), or no keys at all, is an array.
local function is_array(t)
  local n = #t
  local count = 0
  for _ in pairs(t) do count = count + 1 end
  return count == n
end

local function array(t, depth)
  local out = {}
  for i = 1, #t do out[i] = encode(t[i], depth + 1) end
  return "[" .. table.concat(out, ",") .. "]"
end

local function object(t, depth)
  local keys = {}
  for k in pairs(t) do
    if type(k) ~= "string" then error("an object key that is not a string", 0) end
    keys[#keys + 1] = k
  end
  table.sort(keys)
  local out = {}
  for i, k in ipairs(keys) do out[i] = quote(k) .. ":" .. encode(t[k], depth + 1) end
  return "{" .. table.concat(out, ",") .. "}"
end

encode = function(v, depth)
  if depth > MAX_DEPTH then error("nested more than " .. MAX_DEPTH .. " deep", 0) end
  local kind = type(v)
  if kind == "nil" then return "null" end
  if kind == "boolean" then return v and "true" or "false" end
  if kind == "number" then return number(v) end
  if kind == "string" then return quote(v) end
  if kind == "table" then return is_array(v) and array(v, depth) or object(v, depth) end
  error("a " .. kind .. " cannot be written as JSON", 0)
end

-- The JSON text for `value`, or nil and the reason it cannot be written.
function M.encode(value)
  local ok, result = pcall(encode, value, 0)
  if ok then return result end
  return nil, tostring(result)
end

-- The longest line the inspector writes. The game's log keeps at most 4084 characters of a message
-- from Infinity_Log and cuts the rest: every party-check dump was cut there, in Phase 3 and again on
-- 2026-11-14. Lines stay well under that, so none is ever cut.
M.MAX_LINE = 4000

-- One log line: `prefix`, a tab, and `value` as JSON; or nil and why it cannot be written whole.
function M.line(prefix, value)
  local json, why = M.encode(value)
  if not json then return nil, "cannot write a line: " .. why end
  local line = prefix .. "\t" .. json
  if #line > M.MAX_LINE then
    return nil, string.format("a line of %d characters, longer than the %d the log keeps whole",
      #line, M.MAX_LINE)
  end
  return line
end
