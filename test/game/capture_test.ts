import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { clean, LineBuffer, redact, stamp } from "../../src/game/capture.ts";

// Built at run time so this file never contains a real-looking home path or account id.
const HOME = "/Us" + "ers/alice";
const STEAM_ID = "7656" + "1198000000001";

Deno.test("lines split across reads are joined; the remainder waits for the next chunk", () => {
  const buffer = new LineBuffer();
  deepStrictEqual(buffer.push("one\ntw"), ["one"]);
  deepStrictEqual(buffer.push("o\nthree"), ["two"]);
  deepStrictEqual(buffer.flush(), ["three"]);
  deepStrictEqual(buffer.flush(), []);
});

Deno.test("pty artifacts are removed", () => {
  strictEqual(clean("A7X loaded into Game pid=1\r"), "A7X loaded into Game pid=1");
  strictEqual(clean("^D\x08\x08last line"), "last line");
  strictEqual(clean("plain"), "plain");
});

Deno.test("home paths and Steam ids are redacted", () => {
  strictEqual(redact(`${HOME}/Documents/x`, HOME), "$HOME/Documents/x");
  strictEqual(redact(`user ${STEAM_ID} signed in`, HOME), "user <steam-id> signed in");
  strictEqual(redact("Steam ID: 123456", HOME), "Steam ID: <steam-id>");
  strictEqual(redact("nothing to hide", ""), "nothing to hide");
});

Deno.test("session stamps are fixed width, so file names sort by time", () => {
  strictEqual(stamp(Temporal.PlainDateTime.from("2026-03-04T05:06:07")), "20260304-050607");
});
