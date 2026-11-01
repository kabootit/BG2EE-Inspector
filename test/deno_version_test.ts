import { strictEqual } from "node:assert/strict";
import { compareVersions, MIN_DENO } from "../src/deno_version.ts";

Deno.test("versions compare numerically, not as strings", () => {
  strictEqual(compareVersions("2.9.8", "2.9.8"), 0);
  strictEqual(compareVersions("2.10.0", "2.9.8") > 0, true);
  strictEqual(compareVersions("2.8.1", "2.9.8") < 0, true);
  strictEqual(compareVersions("3.0", "2.9.8") > 0, true);
});

Deno.test("the running Deno meets the project minimum", () => {
  strictEqual(compareVersions(Deno.version.deno, MIN_DENO) >= 0, true);
});
