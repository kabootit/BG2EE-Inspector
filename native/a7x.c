/*
 * a7x.dylib: the inspector's read-only native bridge (ADR-0002).
 *
 * Phase 0 (injection smoke test): this only proves the library is loaded into
 * the game process. The constructor runs before the game's main() and writes
 * one marker line to stderr, naming the process it landed in, so a capture can
 * tell the game apart from the launcher processes (script, env) the variable
 * passes through. It touches no game state.
 *
 * Later phases add the address table, the luaL_Reg pointer swap and the
 * mach_vm_read_overwrite readers. There is never a memory-write path.
 */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

__attribute__((constructor)) static void a7x_loaded(void) {
    fprintf(stderr, "A7X loaded into %s pid=%d\n", getprogname(), (int)getpid());
}
