/*
 * builds.h: the per-build address table (ADR-0002).
 *
 * One entry per supported game build, keyed by the arm64 slice's LC_UUID. Each
 * offset is image-relative: add the address of the game's Mach-O header at run
 * time, which already includes the ASLR slide. An unknown UUID disables the
 * library.
 *
 * Every function the library calls is a site: its offset, its size, and the
 * FNV-1a 64-bit hash of its bytes. The two globals cannot be checked that way,
 * so each has an anchor: a site in the game's code whose instructions encode
 * the global's address. The constructor checks every site before anything is
 * read or called; one mismatch disables the library.
 *
 * Written by hand; how each value was found and checked, and how to redo it
 * after a game update: docs/re-notes.md. test/re/builds_test.ts compares every
 * site with the installed game binary, so keep one site per line in this form.
 * The functions are listed in lint:security's ALLOWED_ENGINE_CALLS.
 */
#ifndef A7X_BUILDS_H
#define A7X_BUILDS_H

#include <stdint.h>

/* The engine's own Lua 5.2 API functions the library calls, by index into a7x_build.fns. */
enum a7x_fn {
    A7X_FN_lua_checkstack,
    A7X_FN_lua_settop,
    A7X_FN_lua_tointegerx,
    A7X_FN_lua_tolstring,
    A7X_FN_lua_pushinteger,
    A7X_FN_lua_pushlstring,
    A7X_FN_lua_pushcclosure,
    A7X_FN_lua_createtable,
    A7X_FN_lua_setglobal,
    A7X_FN_lua_setfield,
    A7X_FN_lua_pcallk,
    A7X_FN_COUNT
};

/* A range of the game's code and the hash its bytes must have. */
struct a7x_site {
    const char *name;
    uint64_t offset;
    uint32_t size;
    uint64_t fnv1a;
};

struct a7x_build {
    const char *name;
    uint8_t uuid[16];
    uint64_t lua_state;     /* the engine's lua_State* global */
    uint64_t baldur_chitin; /* g_pBaldurChitin, the object behind the game's Lua global `e` */
    struct a7x_site fns[A7X_FN_COUNT];
    struct a7x_site anchors[2]; /* the code that loads lua_state, and the code that loads baldur_chitin */
};

static const struct a7x_build A7X_BUILDS[] = {
    {
        .name = "2.7.3 arm64",
        .uuid = {0x54, 0x79, 0x9B, 0x31, 0xC2, 0xBF, 0x36, 0xE9, 0x96, 0x85, 0x65, 0xF8, 0xEC, 0x3C, 0xA5, 0x8F},
        .lua_state = 0x35d7478,
        .baldur_chitin = 0x35d70d0,
        .fns = {
            [A7X_FN_lua_checkstack] = {"lua_checkstack", 0x5499cc, 0xd8, 0x24718df8414925d3ULL},
            [A7X_FN_lua_settop] = {"lua_settop", 0x549b80, 0xb8, 0x334739f0b5710589ULL},
            [A7X_FN_lua_tointegerx] = {"lua_tointegerx", 0x54a9a8, 0xf0, 0xbf5d55c6b80a19b6ULL},
            [A7X_FN_lua_tolstring] = {"lua_tolstring", 0x54ac54, 0x1bc, 0x86441056d7bf6eb5ULL},
            [A7X_FN_lua_pushinteger] = {"lua_pushinteger", 0x54b334, 0x24, 0x383881528181a220ULL},
            [A7X_FN_lua_pushlstring] = {"lua_pushlstring", 0x54b37c, 0x78, 0x5409827fd2bccf6cULL},
            [A7X_FN_lua_pushcclosure] = {"lua_pushcclosure", 0x54b520, 0x1a0, 0x021e810b3c6b2f29ULL},
            [A7X_FN_lua_createtable] = {"lua_createtable", 0x54bb10, 0x98, 0x083e7436360b7e59ULL},
            [A7X_FN_lua_setglobal] = {"lua_setglobal", 0x54bd88, 0x88, 0x271622891cefe6faULL},
            [A7X_FN_lua_setfield] = {"lua_setfield", 0x54bee0, 0x104, 0xad8f1260ee1c80e1ULL},
            [A7X_FN_lua_pcallk] = {"lua_pcallk", 0x54c568, 0x1c8, 0x23e95eb53985033fULL},
        },
        .anchors = {
            {"Infinity_* registration (lua_State global)", 0x335440, 0x20, 0x08680401eaf0b437ULL},
            {"tolua g_pBaldurChitin getter", 0x2140c, 0x2c, 0x014deb0222041c68ULL},
        },
    },
};

/*
 * Stock Lua 5.2.4 lua_State layout on arm64, measured with offsetof on the
 * vendored source and matched by the game's lua_checkstack (top 0x10, ci 0x20,
 * stack_last 0x30). Used only to tell whether Lua is running (ADR-0005).
 */
#define A7X_LUA_STATE_CI 0x20      /* CallInfo *ci: the running call */
#define A7X_LUA_STATE_BASE_CI 0x80 /* CallInfo base_ci: ci points here when Lua is idle */

#endif
