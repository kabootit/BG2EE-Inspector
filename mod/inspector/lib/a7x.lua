-- a7x.lua: the inspector's entry point. Infinity_DoFile("a7x") loads the offsets, the walker, the
-- JSON writer, the formatter and, last, the public API (docs/api.md), which keeps the others private
-- and leaves A7X as the only global.
--
-- Loading is idempotent: when A7X is already here, from ui.menu at startup or an earlier
-- Infinity_DoFile, nothing loads again. A second API would find the library's table already taken
-- private by the first and answer no_native.

if type(A7X) == "table" and type(A7X.version) == "function" then return end

for _, name in ipairs({ "a7xoff", "a7xwalk", "a7xjson", "a7xfmt", "a7xapi" }) do
  Infinity_DoFile(name)
end
