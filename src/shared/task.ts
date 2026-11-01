/**
 * The one place a task turns into a process exit code.
 *
 * Every entry point in src/tasks/ is `await runTask(main)`. Library modules
 * never call `Deno.exit` or read `Deno.args`, so tests can import them freely;
 * test/structure_test.ts enforces that this file and src/tasks/ are the only
 * exceptions.
 */
import { denoVersionProblem } from "./deno_version.ts";

/** Check the Deno version, run `main`, and exit with the code it returns. */
export async function runTask(main: () => Promise<number>): Promise<void> {
  const problem = denoVersionProblem();
  if (problem !== null) {
    console.error(problem);
    Deno.exit(1);
  }
  Deno.exit(await main());
}
