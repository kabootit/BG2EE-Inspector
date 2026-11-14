-- a7x.lua: the inspector's entry point. Infinity_DoFile("a7x") loads the offsets, the walker, the
-- JSON writer, the formatter and, last, the public API (docs/api.md), which keeps the others private
-- and leaves A7X as the only global.

for _, name in ipairs({ "a7xoff", "a7xwalk", "a7xjson", "a7xfmt", "a7xapi" }) do
  Infinity_DoFile(name)
end
