/*
 * lua_layout_test.c: the lua_State offsets native/builds.h assumes, measured on the vendored
 * Lua 5.2.4 source (deno task test:native, built with -I vendor/lua-5.2.4/src).
 *
 * The game's own lua_checkstack confirms top, ci and stack_last (docs/re-notes.md); this checks
 * that the constants the library uses are the stock layout's, so a typo in builds.h fails here
 * rather than in the game.
 */
#include <stddef.h>
#include <stdio.h>

#include "../../native/builds.h"
#include "lstate.h"

int main(void) {
    int failures = 0;
#define EXPECT(field, want)                                                                        \
    if (offsetof(lua_State, field) != (want)) {                                                    \
        fprintf(stderr, "FAIL lua_State.%s at %zu, builds.h says %d\n", #field,                     \
                offsetof(lua_State, field), (int)(want));                                          \
        failures++;                                                                                \
    }
    EXPECT(ci, A7X_LUA_STATE_CI)
    EXPECT(base_ci, A7X_LUA_STATE_BASE_CI)
    EXPECT(top, 0x10)
    EXPECT(stack_last, 0x30)
    fprintf(stderr, "lua_layout_test: %s (%d failures)\n", failures ? "FAILED" : "passed", failures);
    return failures != 0;
}
