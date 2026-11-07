/*
 * a7x.dylib: the inspector's read-only native bridge (ADR-0002, ADR-0005).
 *
 * The library interposes glClear, which the game calls about once a frame on
 * its main thread (the hook gate, 2026-11-06). The replacement always calls the
 * real glClear. Before that, on the first call made on the main thread with the
 * engine's Lua state created and idle, it registers one global table,
 * A7X_native, into the game's Lua, using the game's own Lua API functions from
 * builds.h:
 *
 *   A7X_native.Version()          -> 2, "<build name>"
 *   A7X_native.Root()             -> the address of g_pBaldurChitin's object, or nil
 *   A7X_native.Objects()          -> the address of the engine's object array (its bounds are
 *                                    the 16 bytes before it; layout in docs/re-notes.md)
 *   A7X_native.Read(addr, kind)   -> kind u8 i8 u16 i16 u32 i32 ptr: an integer;
 *                                    cstr: up to 256 bytes to the first NUL; or nil
 *   A7X_native.ReadBlock(addr, n) -> a string of exactly n bytes (1 to 4096), or nil
 *
 * Every read goes through mach_vm_read_overwrite, so a bad address returns nil
 * instead of crashing. There is no write path. A bad argument also returns nil;
 * nothing here raises a Lua error.
 *
 * Fail closed: an unknown LC_UUID, any builds.h site whose bytes do not hash as
 * expected, or a failed read while deciding whether Lua is idle disables the
 * bridge, with one line on stderr, and the game runs as if it were absent.
 */
#define GL_SILENCE_DEPRECATION
#include <OpenGL/gl.h>
#include <mach-o/dyld.h>
#include <mach-o/loader.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "builds.h"

/*
 * dyld interposing: a (replacement, original) pair in __DATA,__interpose tells
 * dyld, while it loads this library, to bind every other image's calls to
 * `original` to `replacement` instead. Calls from this library itself still
 * reach the original. The section is declared as Apple's dyld-interposing.h
 * declares it, with the "interposing" section type. Every use is allowlisted
 * in lint:security (ADR-0005).
 */
#define A7X_INTERPOSE(replacement, original)                                                       \
    __attribute__((used)) static const struct {                                                    \
        const void *replacement_fn;                                                                \
        const void *original_fn;                                                                   \
    } a7x_interpose_##original                                                                     \
        __attribute__((section("__DATA,__interpose,interposing"))) = {                             \
            (const void *)&replacement, (const void *)&original};

/* The native API version Version() reports; bumped when the A7X_native functions change. */
#define A7X_NATIVE_VERSION 2

/* Lua 5.2's C API types, as the game was built: lua_Number is double, lua_Integer ptrdiff_t. */
typedef struct lua_State lua_State;
typedef int (*lua_CFunction)(lua_State *L);
typedef ptrdiff_t lua_Integer;

/* The game's own Lua API, resolved from builds.h once every site has been checked. */
static struct {
    int (*checkstack)(lua_State *L, int n);
    void (*settop)(lua_State *L, int idx);
    lua_Integer (*tointegerx)(lua_State *L, int idx, int *isnum);
    const char *(*tolstring)(lua_State *L, int idx, size_t *len);
    void (*pushinteger)(lua_State *L, lua_Integer n);
    const char *(*pushlstring)(lua_State *L, const char *s, size_t len);
    void (*pushcclosure)(lua_State *L, lua_CFunction fn, int n);
    void (*createtable)(lua_State *L, int narr, int nrec);
    void (*setglobal)(lua_State *L, const char *name);
    void (*setfield)(lua_State *L, int idx, const char *k);
    int (*pcallk)(lua_State *L, int nargs, int nresults, int errfunc, int ctx, lua_CFunction k);
} lua;

/* Set by the constructor when the build is known and every site checks out; NULL means inert. */
static const struct a7x_build *build;
static uintptr_t game_base;
static struct timespec started;

static _Atomic unsigned long clears;
static atomic_flag reported_off_main = ATOMIC_FLAG_INIT;

/* Touched only on the main thread, by the glClear replacement. */
static int disabled;
static uintptr_t registered_state;

static double elapsed(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (double)(now.tv_sec - started.tv_sec) + (double)(now.tv_nsec - started.tv_nsec) / 1e9;
}

/* A read that fails instead of crashing on a bad address: all n bytes, or nothing. */
static int read_bytes(uintptr_t at, void *out, size_t n) {
    mach_vm_size_t got = 0;
    kern_return_t kr = mach_vm_read_overwrite(mach_task_self(), (mach_vm_address_t)at,
                                              (mach_vm_size_t)n, (mach_vm_address_t)out, &got);
    return kr == KERN_SUCCESS && got == n;
}

static int read_pointer(uintptr_t at, uintptr_t *out) { return read_bytes(at, out, sizeof *out); }

/* FNV-1a, 64-bit: the hash builds.h records for every site (src/re/builds.ts computes the same). */
static uint64_t fnv1a64(const uint8_t *p, size_t n) {
    uint64_t h = 0xcbf29ce484222325ULL;
    for (size_t i = 0; i < n; i++) {
        h ^= p[i];
        h *= 0x100000001b3ULL;
    }
    return h;
}

static int site_matches(uintptr_t base, const struct a7x_site *site) {
    uint8_t bytes[512];
    return site->size <= sizeof bytes && read_bytes(base + site->offset, bytes, site->size) &&
           fnv1a64(bytes, site->size) == site->fnv1a;
}

/* The game's own image: the one main executable among the loaded images. */
static const struct mach_header_64 *game_header(void) {
    for (uint32_t i = 0; i < _dyld_image_count(); i++) {
        const struct mach_header *h = _dyld_get_image_header(i);
        if (h && h->magic == MH_MAGIC_64 && h->filetype == MH_EXECUTE) {
            return (const struct mach_header_64 *)h;
        }
    }
    return NULL;
}

static const uint8_t *image_uuid(const struct mach_header_64 *h) {
    const uint8_t *p = (const uint8_t *)(h + 1);
    for (uint32_t i = 0; i < h->ncmds; i++) {
        const struct load_command *lc = (const struct load_command *)p;
        if (lc->cmd == LC_UUID) return ((const struct uuid_command *)lc)->uuid;
        p += lc->cmdsize;
    }
    return NULL;
}

static void print_uuid(const uint8_t *u) {
    for (int i = 0; i < 16; i++) {
        fprintf(stderr, "%02X%s", u[i], (i == 3 || i == 5 || i == 7 || i == 9) ? "-" : "");
    }
}

/* The first site of `b` whose bytes differ, or NULL when all match. */
static const struct a7x_site *failed_site(uintptr_t base, const struct a7x_build *b) {
    for (size_t i = 0; i < A7X_FN_COUNT; i++) {
        if (!site_matches(base, &b->fns[i])) return &b->fns[i];
    }
    for (size_t i = 0; i < sizeof b->anchors / sizeof b->anchors[0]; i++) {
        if (!site_matches(base, &b->anchors[i])) return &b->anchors[i];
    }
    return NULL;
}

#define ENGINE_FN(index) ((void *)(game_base + build->fns[index].offset))

static void resolve_lua_api(void) {
    lua.checkstack = ENGINE_FN(A7X_FN_lua_checkstack);
    lua.settop = ENGINE_FN(A7X_FN_lua_settop);
    lua.tointegerx = ENGINE_FN(A7X_FN_lua_tointegerx);
    lua.tolstring = ENGINE_FN(A7X_FN_lua_tolstring);
    lua.pushinteger = ENGINE_FN(A7X_FN_lua_pushinteger);
    lua.pushlstring = ENGINE_FN(A7X_FN_lua_pushlstring);
    lua.pushcclosure = ENGINE_FN(A7X_FN_lua_pushcclosure);
    lua.createtable = ENGINE_FN(A7X_FN_lua_createtable);
    lua.setglobal = ENGINE_FN(A7X_FN_lua_setglobal);
    lua.setfield = ENGINE_FN(A7X_FN_lua_setfield);
    lua.pcallk = ENGINE_FN(A7X_FN_lua_pcallk);
}

__attribute__((constructor)) static void a7x_loaded(void) {
    clock_gettime(CLOCK_MONOTONIC, &started);
    fprintf(stderr, "A7X loaded into %s pid=%d\n", getprogname(), (int)getpid());

    const struct mach_header_64 *h = game_header();
    const uint8_t *uuid = h ? image_uuid(h) : NULL;
    if (!uuid) {
        fprintf(stderr, "A7X disabled: no main image or no LC_UUID\n");
        return;
    }
    for (size_t i = 0; i < sizeof A7X_BUILDS / sizeof A7X_BUILDS[0]; i++) {
        if (memcmp(uuid, A7X_BUILDS[i].uuid, 16) != 0) continue;
        const struct a7x_site *bad = failed_site((uintptr_t)h, &A7X_BUILDS[i]);
        if (bad) {
            fprintf(stderr, "A7X disabled: build %s, bytes differ at %s (+0x%llx)\n",
                    A7X_BUILDS[i].name, bad->name, (unsigned long long)bad->offset);
            return;
        }
        build = &A7X_BUILDS[i];
        game_base = (uintptr_t)h;
        resolve_lua_api();
        fprintf(stderr, "A7X build %s matched, %d sites checked, image at 0x%lx\n", build->name,
                (int)(A7X_FN_COUNT + sizeof build->anchors / sizeof build->anchors[0]),
                (unsigned long)game_base);
        return;
    }
    fprintf(stderr, "A7X disabled: unknown build ");
    print_uuid(uuid);
    fprintf(stderr, "\n");
}

/* --- the functions registered into Lua ---------------------------------------------------- */

/* An address argument: an integer from 1 to 2^53, the range a Lua 5.2 number holds exactly. */
static int arg_address(lua_State *L, int idx, uintptr_t *out) {
    int ok = 0;
    lua_Integer v = lua.tointegerx(L, idx, &ok);
    if (!ok || v < 1 || v > ((lua_Integer)1 << 53)) return 0;
    *out = (uintptr_t)v;
    return 1;
}

static int native_version(lua_State *L) {
    lua.pushinteger(L, A7X_NATIVE_VERSION);
    lua.pushlstring(L, build->name, strlen(build->name));
    return 2;
}

static int native_root(lua_State *L) {
    uintptr_t root = 0;
    if (!read_pointer(game_base + build->baldur_chitin, &root) || !root) return 0;
    lua.pushinteger(L, (lua_Integer)root);
    return 1;
}

/* The object array is a static table in the game image, so its address needs no read. */
static int native_objects(lua_State *L) {
    lua.pushinteger(L, (lua_Integer)(game_base + build->object_array));
    return 1;
}

/* Up to 256 bytes to the first NUL, read a page at a time so a string ending near an unmapped
 * page is still returned. Nothing when the first byte cannot be read. */
static int read_cstr(lua_State *L, uintptr_t at) {
    char text[256];
    size_t have = 0;
    while (have < sizeof text) {
        uintptr_t here = at + have;
        size_t to_page = vm_page_size - (here % vm_page_size);
        size_t chunk = sizeof text - have < to_page ? sizeof text - have : to_page;
        if (!read_bytes(here, text + have, chunk)) break;
        const char *nul = memchr(text + have, '\0', chunk);
        if (nul) {
            have = (size_t)(nul - text);
            lua.pushlstring(L, text, have);
            return 1;
        }
        have += chunk;
    }
    if (have == 0) return 0;
    lua.pushlstring(L, text, have);
    return 1;
}

static const struct {
    const char *name;
    uint8_t size;
    uint8_t is_signed;
} READ_KINDS[] = {
    {"u8", 1, 0}, {"i8", 1, 1}, {"u16", 2, 0}, {"i16", 2, 1},
    {"u32", 4, 0}, {"i32", 4, 1}, {"ptr", 8, 0},
};

static int native_read(lua_State *L) {
    uintptr_t at = 0;
    size_t len = 0;
    if (!arg_address(L, 1, &at)) return 0;
    const char *kind = lua.tolstring(L, 2, &len);
    if (!kind) return 0;
    if (len == 4 && memcmp(kind, "cstr", 4) == 0) return read_cstr(L, at);
    for (size_t i = 0; i < sizeof READ_KINDS / sizeof READ_KINDS[0]; i++) {
        if (strlen(READ_KINDS[i].name) != len || memcmp(kind, READ_KINDS[i].name, len) != 0) {
            continue;
        }
        uint8_t bytes[8];
        if (!read_bytes(at, bytes, READ_KINDS[i].size)) return 0;
        uint64_t value = 0;
        for (int b = READ_KINDS[i].size - 1; b >= 0; b--) value = (value << 8) | bytes[b];
        if (READ_KINDS[i].is_signed) {
            unsigned shift = 64 - 8 * READ_KINDS[i].size;
            lua.pushinteger(L, (lua_Integer)((int64_t)(value << shift) >> shift));
        } else {
            lua.pushinteger(L, (lua_Integer)value);
        }
        return 1;
    }
    return 0;
}

static int native_read_block(lua_State *L) {
    uintptr_t at = 0;
    int ok = 0;
    if (!arg_address(L, 1, &at)) return 0;
    lua_Integer n = lua.tointegerx(L, 2, &ok);
    if (!ok || n < 1 || n > 4096) return 0;
    char bytes[4096];
    if (!read_bytes(at, bytes, (size_t)n)) return 0;
    lua.pushlstring(L, bytes, (size_t)n);
    return 1;
}

static const struct {
    const char *name;
    lua_CFunction fn;
} NATIVE_FUNCTIONS[] = {
    {"Version", native_version},
    {"Root", native_root},
    {"Objects", native_objects},
    {"Read", native_read},
    {"ReadBlock", native_read_block},
};

/* Runs inside lua_pcallk: any Lua error here, including a GC finalizer's, returns as a status. */
static int a7x_register(lua_State *L) {
    size_t count = sizeof NATIVE_FUNCTIONS / sizeof NATIVE_FUNCTIONS[0];
    lua.createtable(L, 0, (int)count);
    for (size_t i = 0; i < count; i++) {
        lua.pushcclosure(L, NATIVE_FUNCTIONS[i].fn, 0);
        lua.setfield(L, -2, NATIVE_FUNCTIONS[i].name);
    }
    lua.setglobal(L, "A7X_native");
    return 0;
}

/* --- the hook ------------------------------------------------------------------------------ */

static void disable(const char *why) {
    disabled = 1;
    fprintf(stderr, "A7X disabled: %s\n", why);
}

static void register_native(lua_State *L, unsigned long call) {
    if (!lua.checkstack(L, 2)) {
        disable("no Lua stack space to register A7X_native");
        return;
    }
    lua.pushcclosure(L, a7x_register, 0); /* a light C function: no allocation, no error */
    int status = lua.pcallk(L, 0, 0, 0, 0, NULL);
    if (status != 0) {
        size_t len = 0;
        const char *message = lua.tolstring(L, -1, &len);
        fprintf(stderr, "A7X disabled: registering A7X_native failed with status %d: %.*s\n",
                status, message ? (int)(len < 200 ? len : 200) : 0, message ? message : "");
        lua.settop(L, -2); /* pop the error */
        disabled = 1;
        return;
    }
    registered_state = (uintptr_t)L;
    fprintf(stderr, "A7X registered A7X_native at %.1fs, glClear call %lu\n", elapsed(), call);
}

/*
 * Main thread only. Registers once the lua_State global is set and Lua is idle (L->ci is
 * &L->base_ci), and again if the global ever holds a different state. Busy Lua waits for the
 * next frame; a failed read means the layout is not what builds.h says, so the bridge stops.
 */
static void bridge_frame(unsigned long call) {
    uintptr_t L = 0, ci = 0;
    if (!read_pointer(game_base + build->lua_state, &L)) {
        disable("cannot read the lua_State global");
        return;
    }
    if (!L || L == registered_state) return;
    if (!read_pointer(L + A7X_LUA_STATE_CI, &ci)) {
        disable("cannot read lua_State->ci");
        return;
    }
    if (ci != L + A7X_LUA_STATE_BASE_CI) return;
    if (registered_state) fprintf(stderr, "A7X lua_State changed, registering again\n");
    register_native((lua_State *)L, call);
}

static void a7x_glClear(GLbitfield mask) {
    unsigned long call = atomic_fetch_add(&clears, 1) + 1;
    if (!pthread_main_np()) {
        if (!atomic_flag_test_and_set(&reported_off_main)) {
            fprintf(stderr, "A7X glClear call %lu was off the main thread; ignored\n", call);
        }
    } else if (build && !disabled) {
        bridge_frame(call);
    }
    glClear(mask);
}

A7X_INTERPOSE(a7x_glClear, glClear)
