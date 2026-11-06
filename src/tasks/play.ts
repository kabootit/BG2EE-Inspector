/**
 * `deno task play [--no-inject]`: launch the game with the inspector's library loaded, capture what
 * it prints to logs/session-<stamp>.log (redacted), show the library's own lines as they arrive, and
 * report whether the library loaded.
 *
 * `--no-inject` is the control run: the same launch without the library.
 */
import { stamp } from "../game/capture.ts";
import { isLibraryLine, isLoadMarker, launchCommand, summarize } from "../game/launch.ts";
import { captureSession } from "../game/session.ts";
import { verifyDylib } from "../build/dylib.ts";
import { realSystem } from "../setup/system.ts";
import { DYLIB_PATH, GAME_BINARY, LOGS_DIR } from "../shared/config.ts";
import { runTask } from "../shared/task.ts";

const KNOWN_FLAGS = new Set(["--no-inject"]);

await runTask(async () => {
  const unknown = Deno.args.filter((a) => !KNOWN_FLAGS.has(a));
  if (unknown.length > 0) {
    console.error(`play: unknown option ${unknown.join(" ")}; usage: deno task play [--no-inject]`);
    return 2;
  }
  const inject = !Deno.args.includes("--no-inject");

  if (inject) {
    const dylib = await verifyDylib(realSystem, DYLIB_PATH);
    if (!dylib.ok) {
      console.error(`play: ${dylib.detail}. Run deno task build first.`);
      return 1;
    }
  }
  if (!(await realSystem.exists(GAME_BINARY))) {
    console.error(`play: game not found at ${GAME_BINARY}. See deno task doctor.`);
    return 1;
  }

  const home = Deno.env.get("HOME") ?? "";
  const gameProcess = GAME_BINARY.split("/").pop() ?? "";
  await Deno.mkdir(LOGS_DIR, { recursive: true });
  const logPath = `${LOGS_DIR}/session-${stamp(Temporal.Now.plainDateTimeISO())}.log`;
  const log = await Deno.open(logPath, { create: true, write: true, truncate: true });
  const encoder = new TextEncoder();

  console.log(`play: ${inject ? "with build/a7x.dylib" : "control run, no library"}`);
  console.log(`play: session log logs/${logPath.split("/").pop()}`);
  console.log("play: quit the game to finish.\n");

  // The library's lines are shown as they arrive, and only the load markers are kept; everything
  // else goes straight to the log.
  const markers: string[] = [];
  try {
    const { lineCount, exitCode } = await captureSession(
      launchCommand({ binary: GAME_BINARY, dylib: DYLIB_PATH, inject }),
      home,
      async (line) => {
        await log.write(encoder.encode(`${line}\n`));
        if (isLibraryLine(line)) console.log(`  ${line}`);
        if (isLoadMarker(line)) markers.push(line);
      },
    );
    const summary = summarize(markers, gameProcess);
    console.log(`\nplay: game exited with code ${exitCode}; ${lineCount} lines captured`);
    if (!inject) {
      console.log(`play: control run; library markers seen: ${summary.loaded.length} (expected 0)`);
      return summary.loaded.length === 0 ? 0 : 1;
    }
    if (summary.loadedIntoGame) {
      console.log("play: the library loaded into the game process.");
      return 0;
    }
    console.error(
      summary.loaded.length > 0
        ? `play: the library loaded, but not into the game: ${summary.loaded.join("; ")}`
        : "play: no load marker seen; the library did not load into the game.",
    );
    return 1;
  } finally {
    log.close();
  }
});
