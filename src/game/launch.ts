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
  /** Marker lines from the dylib, e.g. "A7X loaded into BaldursGateIIEnhancedEdition pid=123". */
  loaded: string[];
  /** Whether a marker names the game, not a launcher process. */
  loadedIntoGame: boolean;
}

/** Whether a captured line is the dylib's load marker. */
export const isLoadMarker = (line: string): boolean => line.includes(LOADED_MARKER);

/** Whether a captured line comes from the dylib: the load marker, or any line it starts with "A7X ". */
export const isLibraryLine = (line: string): boolean =>
  isLoadMarker(line) || line.startsWith("A7X ");

/** What a session's marker lines say about the injection. */
export function summarize(markers: string[], gameProcess: string): SessionSummary {
  const loaded = markers.filter(isLoadMarker);
  return {
    loaded,
    loadedIntoGame: loaded.some((l) => l.includes(`${LOADED_MARKER}${gameProcess} `)),
  };
}
