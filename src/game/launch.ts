/**
 * How the game is launched, and what a session showed.
 *
 * `script` runs the game in a pseudo-terminal so its output is line-buffered
 * rather than held in 4 KB blocks (BG2EE-GameLog, gotcha 12). The variable is set
 * by `/usr/bin/env` inside script's argument list rather than in script's own
 * environment, because dyld strips DYLD_* variables from SIP-protected binaries
 * such as script; env sets it fresh for the game (Phase 0 tests exactly this).
 */
import { BIN, LOADED_MARKER } from "../shared/config.ts";

export interface LaunchOptions {
  binary: string;
  dylib: string;
  /** False for the control run: the same launch with no library. */
  inject: boolean;
}

export interface Launch {
  cmd: string;
  args: string[];
}

export function launchCommand(opts: LaunchOptions): Launch {
  const env = opts.inject ? [BIN.env, `DYLD_INSERT_LIBRARIES=${opts.dylib}`] : [];
  return { cmd: BIN.script, args: ["-q", "/dev/null", ...env, opts.binary] };
}

export interface SessionSummary {
  lines: number;
  /** Marker lines from the dylib, e.g. "A7X loaded into BaldursGateIIEnhancedEdition pid=123". */
  loaded: string[];
  /** Whether a marker names the game, not a launcher process. */
  loadedIntoGame: boolean;
}

/** What a captured session says about the injection. */
export function summarize(lines: string[], gameProcess: string): SessionSummary {
  const loaded = lines.filter((l) => l.includes(LOADED_MARKER));
  return {
    lines: lines.length,
    loaded,
    loadedIntoGame: loaded.some((l) => l.includes(`${LOADED_MARKER}${gameProcess} `)),
  };
}
