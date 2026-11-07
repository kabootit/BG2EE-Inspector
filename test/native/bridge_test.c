/*
 * bridge_test.c: native/a7x.c without the game (deno task test:native).
 *
 * The library's source is included, so its static functions can be called directly; the game's
 * Lua API is replaced by fakes over a small value stack. Checked: every Read kind with sign
 * extension, cstr at an unmapped page, ReadBlock bounds, bad arguments, Version, Root, Objects,
 * and each registration state. Given the game's arm64 slice as its argument, it also hashes every
 * builds.h site over the file, with a flipped byte in a function and in an anchor.
 *
 * Exits 0 when every check passes. The constructor runs first and reports an unknown build: this
 * executable is not the game.
 */
#include "../../native/a7x.c"

#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>

struct lua_State {
    int unused;
};

typedef struct {
    int is_string;
    lua_Integer i;
    char s[4200];
    size_t len;
} value;

static value stack[16];
static int top;
static int failures;

#define CHECK(c)                                                                                   \
    do {                                                                                           \
        if (!(c)) {                                                                                \
            failures++;                                                                            \
            fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #c);                                   \
        }                                                                                          \
    } while (0)

static void reset(void) { top = 0; }
static void arg_integer(lua_Integer i) {
    stack[top].is_string = 0;
    stack[top].i = i;
    top++;
}
static void arg_bytes(const char *s, size_t n) {
    stack[top].is_string = 1;
    stack[top].len = n;
    memcpy(stack[top].s, s, n);
    top++;
}
static void arg_string(const char *s) { arg_bytes(s, strlen(s)); }
static value *slot(int idx) {
    int k = idx > 0 ? idx - 1 : top + idx;
    return k >= 0 && k < top ? &stack[k] : NULL;
}
static lua_Integer last_integer(void) { return stack[top - 1].i; }
static size_t last_length(void) { return stack[top - 1].len; }

static lua_Integer fake_tointegerx(lua_State *L, int idx, int *ok) {
    (void)L;
    value *v = slot(idx);
    *ok = v && !v->is_string;
    return *ok ? v->i : 0;
}
static const char *fake_tolstring(lua_State *L, int idx, size_t *len) {
    (void)L;
    value *v = slot(idx);
    if (!v || !v->is_string) return NULL;
    if (len) *len = v->len;
    return v->s;
}
static void fake_pushinteger(lua_State *L, lua_Integer n) {
    (void)L;
    arg_integer(n);
}
static const char *fake_pushlstring(lua_State *L, const char *s, size_t n) {
    (void)L;
    arg_bytes(s, n);
    return stack[top - 1].s;
}
static int fake_checkstack(lua_State *L, int n) {
    (void)L;
    (void)n;
    return 1;
}
static int settop_arg;
static void fake_settop(lua_State *L, int idx) {
    (void)L;
    settop_arg = idx;
    top += idx + 1;
}
static lua_CFunction pushed;
static void fake_pushcclosure(lua_State *L, lua_CFunction fn, int n) {
    (void)L;
    (void)n;
    pushed = fn;
}
static int fields;
static char field_names[8][32];
static void fake_createtable(lua_State *L, int narr, int nrec) {
    (void)L;
    (void)narr;
    (void)nrec;
    fields = 0;
}
static void fake_setfield(lua_State *L, int idx, const char *k) {
    (void)L;
    (void)idx;
    snprintf(field_names[fields++], sizeof field_names[0], "%s", k);
}
static char global_name[32];
static void fake_setglobal(lua_State *L, const char *name) {
    (void)L;
    snprintf(global_name, sizeof global_name, "%s", name);
}
static int pcall_status;
static int fake_pcallk(lua_State *L, int nargs, int nresults, int errfunc, int ctx,
                       lua_CFunction k) {
    (void)nargs;
    (void)nresults;
    (void)errfunc;
    (void)ctx;
    (void)k;
    if (pcall_status) {
        reset();
        arg_string("boom");
        return pcall_status;
    }
    return pushed(L);
}

static void use_fake_lua(void) {
    lua.tointegerx = fake_tointegerx;
    lua.tolstring = fake_tolstring;
    lua.pushinteger = fake_pushinteger;
    lua.pushlstring = fake_pushlstring;
    lua.checkstack = fake_checkstack;
    lua.settop = fake_settop;
    lua.pushcclosure = fake_pushcclosure;
    lua.createtable = fake_createtable;
    lua.setfield = fake_setfield;
    lua.setglobal = fake_setglobal;
    lua.pcallk = fake_pcallk;
}

static void sites_against_slice(const char *path) {
    int fd = open(path, O_RDONLY);
    struct stat sb;
    CHECK(fd >= 0 && fstat(fd, &sb) == 0);
    if (fd < 0) return;
    uint8_t *map = mmap(NULL, (size_t)sb.st_size, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);
    CHECK(map != MAP_FAILED);
    const struct a7x_build *b = &A7X_BUILDS[0];
    CHECK(failed_site((uintptr_t)map, b) == NULL);
    uint8_t *in_function = map + b->fns[A7X_FN_lua_setfield].offset + 7;
    *in_function ^= 1;
    const struct a7x_site *bad = failed_site((uintptr_t)map, b);
    CHECK(bad && strcmp(bad->name, "lua_setfield") == 0);
    *in_function ^= 1;
    uint8_t *in_anchor = map + b->anchors[1].offset + 0x10;
    *in_anchor ^= 1;
    bad = failed_site((uintptr_t)map, b);
    CHECK(bad && strstr(bad->name, "g_pBaldurChitin") != NULL);
    munmap(map, (size_t)sb.st_size);
    close(fd);
}

static void reads(void) {
    static uint8_t mem[16] = {0xfe, 0xff, 0xff, 0x7f, 0x80, 0, 0, 0,
                              0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x08};
    const struct {
        const char *kind;
        size_t at;
        lua_Integer want;
    } cases[] = {
        {"u8", 0, 0xfe},
        {"i8", 0, -2},
        {"u16", 0, 0xfffe},
        {"i16", 0, -2},
        {"u32", 0, 0x7ffffffe},
        {"i32", 4, 0x80},
        {"i32", 1, (lua_Integer)(int32_t)0x807fffffU},
        {"ptr", 8, 0x0877665544332211},
    };
    for (size_t i = 0; i < sizeof cases / sizeof cases[0]; i++) {
        reset();
        arg_integer((lua_Integer)(uintptr_t)(mem + cases[i].at));
        arg_string(cases[i].kind);
        int n = native_read(NULL);
        CHECK(n == 1 && last_integer() == cases[i].want);
    }
    reset();
    arg_integer(16);
    arg_string("u32");
    CHECK(native_read(NULL) == 0);
    reset();
    arg_integer((lua_Integer)(uintptr_t)mem);
    arg_string("u64");
    CHECK(native_read(NULL) == 0);
    reset();
    arg_integer(0);
    arg_string("u8");
    CHECK(native_read(NULL) == 0);
    reset();
    arg_integer(((lua_Integer)1 << 53) + 1);
    arg_string("u8");
    CHECK(native_read(NULL) == 0);
    reset();
    arg_string("x");
    arg_string("u8");
    CHECK(native_read(NULL) == 0);
    reset();
    arg_integer((lua_Integer)(uintptr_t)mem);
    CHECK(native_read(NULL) == 0);
}

static void strings_and_blocks(void) {
    static char hello[] = "hello";
    reset();
    arg_integer((lua_Integer)(uintptr_t)hello);
    arg_string("cstr");
    CHECK(native_read(NULL) == 1 && last_length() == 5);
    static char unterminated[400];
    memset(unterminated, 'x', sizeof unterminated);
    reset();
    arg_integer((lua_Integer)(uintptr_t)unterminated);
    arg_string("cstr");
    CHECK(native_read(NULL) == 1 && last_length() == 256);
    size_t page = vm_page_size;
    char *two = mmap(NULL, 2 * page, PROT_READ | PROT_WRITE, MAP_ANON | MAP_PRIVATE, -1, 0);
    memset(two, 'y', page);
    munmap(two + page, page);
    reset();
    arg_integer((lua_Integer)(uintptr_t)(two + page - 10));
    arg_string("cstr");
    CHECK(native_read(NULL) == 1 && last_length() == 10);
    reset();
    arg_integer((lua_Integer)(uintptr_t)(two + page));
    arg_string("cstr");
    CHECK(native_read(NULL) == 0);

    reset();
    arg_integer((lua_Integer)(uintptr_t)unterminated);
    arg_integer(64);
    CHECK(native_read_block(NULL) == 1 && last_length() == 64);
    reset();
    arg_integer((lua_Integer)(uintptr_t)unterminated);
    arg_integer(0);
    CHECK(native_read_block(NULL) == 0);
    reset();
    arg_integer((lua_Integer)(uintptr_t)unterminated);
    arg_integer(4097);
    CHECK(native_read_block(NULL) == 0);
    reset();
    arg_integer((lua_Integer)(uintptr_t)(two + page - 10));
    arg_integer(20);
    CHECK(native_read_block(NULL) == 0);
    munmap(two, page);
}

static void version_and_root(void) {
    reset();
    CHECK(native_version(NULL) == 2 && stack[0].i == A7X_NATIVE_VERSION &&
          stack[1].len == strlen(build->name));
    static uintptr_t root_slot = 0x123456789a;
    game_base = (uintptr_t)&root_slot - build->baldur_chitin;
    reset();
    CHECK(native_root(NULL) == 1 && last_integer() == 0x123456789a);
    root_slot = 0;
    reset();
    CHECK(native_root(NULL) == 0);
    reset();
    CHECK(native_objects(NULL) == 1 && last_integer() == (lua_Integer)(game_base + build->object_array));
}

static void registration(void) {
    static uint8_t state_a[208], state_b[208];
    static uintptr_t state_slot;
    game_base = (uintptr_t)&state_slot - build->lua_state;
    state_slot = 0;
    bridge_frame(1);
    CHECK(registered_state == 0 && !disabled); /* no state yet */
    state_slot = (uintptr_t)state_a;
    *(uintptr_t *)(state_a + A7X_LUA_STATE_CI) = (uintptr_t)state_a + 0x40;
    bridge_frame(2);
    CHECK(registered_state == 0 && !disabled); /* Lua busy: waits */
    *(uintptr_t *)(state_a + A7X_LUA_STATE_CI) = (uintptr_t)state_a + A7X_LUA_STATE_BASE_CI;
    bridge_frame(3);
    CHECK(registered_state == (uintptr_t)state_a); /* idle: registers */
    CHECK(fields == (int)(sizeof NATIVE_FUNCTIONS / sizeof NATIVE_FUNCTIONS[0]));
    CHECK(strcmp(field_names[0], "Version") == 0 && strcmp(global_name, "A7X_native") == 0);
    fields = 0;
    bridge_frame(4);
    CHECK(fields == 0); /* same state: nothing */
    state_slot = (uintptr_t)state_b;
    *(uintptr_t *)(state_b + A7X_LUA_STATE_CI) = (uintptr_t)state_b + A7X_LUA_STATE_BASE_CI;
    bridge_frame(5);
    CHECK(registered_state == (uintptr_t)state_b && fields > 0); /* a new state: again */
    state_slot = (uintptr_t)state_a;
    pcall_status = 2;
    reset();
    bridge_frame(6);
    CHECK(disabled && settop_arg == -2 && top == 0); /* an error: logged, popped, disabled */
    disabled = 0;
    registered_state = 0;
    pcall_status = 0;
    state_slot = 16;
    bridge_frame(7);
    CHECK(disabled); /* an unreadable L->ci: disabled */
}

int main(int argc, char **argv) {
    if (argc > 1) sites_against_slice(argv[1]);
    use_fake_lua();
    build = &A7X_BUILDS[0];
    reads();
    strings_and_blocks();
    version_and_root();
    registration();
    fprintf(stderr, "bridge_test: %s (%d failures)\n", failures ? "FAILED" : "passed", failures);
    return failures != 0;
}
