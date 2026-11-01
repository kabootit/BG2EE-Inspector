import { strictEqual } from "node:assert/strict";
import { compareVersions, denoVersionProblem, MIN_DENO } from "../../src/shared/deno_version.ts";

Deno.test("versions compare numerically, not as strings", () => {
  strictEqual(compareVersions("2.9.8", "2.9.8"), 0);
  strictEqual(compareVersions("2.10.0", "2.9.8") > 0, true);
  strictEqual(compareVersions("2.8.1", "2.9.8") < 0, true);
  strictEqual(compareVersions("3.0", "2.9.8") > 0, true);
});

Deno.test("an older Deno is reported; the minimum and newer are not", () => {
  strictEqual(typeof denoVersionProblem("2.8.1"), "string");
  strictEqual(denoVersionProblem(MIN_DENO), null);
  strictEqual(denoVersionProblem("2.10.0"), null);
});

Deno.test("the running Deno meets the project minimum", () => {
  strictEqual(denoVersionProblem(), null);
});
