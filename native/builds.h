/*
 * builds.h: the per-build address table (ADR-0002).
 *
 * One entry per supported game build, keyed by the arm64 slice's LC_UUID. Each
 * offset is image-relative: add the address of the game's Mach-O header at run
 * time, which already includes the ASLR slide. An unknown UUID disables the
 * library.
 *
 * Written by hand for now; `deno task derive` will generate it (Phase 1). How
 * each value was found and checked: ADR-0005.
 */
#ifndef A7X_BUILDS_H
#define A7X_BUILDS_H

#include <stdint.h>

struct a7x_build {
    const char *name;
    uint8_t uuid[16];
    /* The engine's lua_State* global, loaded by the Infinity_* registration code. */
    uint64_t lua_state;
};

static const struct a7x_build A7X_BUILDS[] = {
    {
        "2.7.3 arm64",
        {0x54, 0x79, 0x9B, 0x31, 0xC2, 0xBF, 0x36, 0xE9, 0x96, 0x85, 0x65, 0xF8, 0xEC, 0x3C, 0xA5, 0x8F},
        0x35d7478,
    },
};

/*
 * Stock Lua 5.2.4 lua_State layout on arm64, measured with offsetof on the
 * vendored source and matched by the game's lua_pushcclosure (L->top at 0x10,
 * L->l_G at 0x18). Used only to tell whether Lua is running (ADR-0005).
 */
#define A7X_LUA_STATE_CI 0x20      /* CallInfo *ci: the running call */
#define A7X_LUA_STATE_BASE_CI 0x80 /* CallInfo base_ci: ci points here when Lua is idle */

#endif
