/*
 * a7x.dylib: the inspector's read-only native bridge (ADR-0002).
 *
 * Current stage: the hook probe, the gate in ADR-0005. The library interposes
 * glClear, which the game imports from OpenGL and is expected to call once a
 * frame on its main thread. The replacement only observes and then calls the
 * real glClear: it registers nothing into Lua and writes no game memory. What
 * it reports, to stderr:
 *
 *   - whether the build is the one builds.h knows (by LC_UUID); if not, it
 *     reads no game memory at all;
 *   - when glClear is first called, and from which thread;
 *   - when the engine's lua_State global becomes non-null;
 *   - every 3600 calls, how many found Lua in the middle of running code.
 *
 * Registering the A7X_* functions from this hook (calling the game's own
 * lua_pushcclosure and lua_setglobal) waits until the probe shows the hook
 * runs on the main thread while Lua is idle. There is never a memory-write path.
 */
#define GL_SILENCE_DEPRECATION
#include <OpenGL/gl.h>
#include <mach-o/dyld.h>
#include <mach-o/loader.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <pthread.h>
#include <stdatomic.h>
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

/* Set by the constructor when the build is known; NULL means no game memory is read. */
static const struct a7x_build *build;
static uintptr_t game_base;
static struct timespec started;

static _Atomic unsigned long clears;
static _Atomic unsigned long busy;
static _Atomic uintptr_t lua_state;
static atomic_flag reported_busy = ATOMIC_FLAG_INIT;
static atomic_flag reported_off_main = ATOMIC_FLAG_INIT;

static double elapsed(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (double)(now.tv_sec - started.tv_sec) + (double)(now.tv_nsec - started.tv_nsec) / 1e9;
}

/* A pointer-sized read that fails instead of crashing on a bad address. */
static int read_pointer(uintptr_t at, uintptr_t *out) {
    mach_vm_size_t got = 0;
    kern_return_t kr = mach_vm_read_overwrite(mach_task_self(), (mach_vm_address_t)at, sizeof *out,
                                              (mach_vm_address_t)out, &got);
    return kr == KERN_SUCCESS && got == sizeof *out;
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
        if (memcmp(uuid, A7X_BUILDS[i].uuid, 16) == 0) {
            build = &A7X_BUILDS[i];
            game_base = (uintptr_t)h;
            fprintf(stderr, "A7X build %s matched\n", build->name);
            return;
        }
    }
    fprintf(stderr, "A7X disabled: unknown build ");
    print_uuid(uuid);
    fprintf(stderr, "\n");
}

/* Whether Lua is in the middle of running code: L->ci is anything but &L->base_ci. */
static int lua_running(uintptr_t L) {
    uintptr_t ci = 0;
    return read_pointer(L + A7X_LUA_STATE_CI, &ci) && ci != L + A7X_LUA_STATE_BASE_CI;
}

static void a7x_glClear(GLbitfield mask) {
    unsigned long n = atomic_fetch_add(&clears, 1) + 1;
    int on_main = pthread_main_np();

    if (n == 1) {
        fprintf(stderr, "A7X probe: first glClear at %.1fs, main thread %s\n", elapsed(),
                on_main ? "yes" : "no");
    }
    if (!on_main && !atomic_flag_test_and_set(&reported_off_main)) {
        fprintf(stderr, "A7X probe: glClear call %lu was off the main thread\n", n);
    }

    if (build) {
        uintptr_t L = atomic_load(&lua_state);
        if (!L && read_pointer(game_base + build->lua_state, &L) && L) {
            atomic_store(&lua_state, L);
            fprintf(stderr, "A7X probe: lua_State set at %.1fs, by glClear call %lu\n", elapsed(),
                    n);
        }
        if (L && lua_running(L)) {
            atomic_fetch_add(&busy, 1);
            if (!atomic_flag_test_and_set(&reported_busy)) {
                fprintf(stderr, "A7X probe: Lua was running during glClear call %lu\n", n);
            }
        }
    }

    if (n % 3600 == 0) {
        fprintf(stderr, "A7X probe: %lu glClear calls in %.0fs, Lua running during %lu\n", n,
                elapsed(), atomic_load(&busy));
    }
    glClear(mask);
}

A7X_INTERPOSE(a7x_glClear, glClear)
