-- insp.lua: the inspector's entry point. Infinity_DoFile("insp") loads the offsets, the walker, the
-- JSON writer, the formatter and, last, the public API (docs/api.md), which keeps the others private
-- and leaves I as the only global.
--
-- Loading is idempotent: when I is already here, from ui.menu at startup or an earlier
-- Infinity_DoFile, nothing loads again. A second API would find the library's table already taken
-- private by the first and answer no_native.

if type(I) == "table" and type(I.version) == "function" then return end

for _, name in ipairs({ "inspoff", "inspwalk", "inspjson", "inspfmt", "inspapi" }) do
  Infinity_DoFile(name)
end
