"use strict";

/**
 * test/tctbp-gates.test.js
 *
 * Gate command resolution tests. Covers the release-build key spelling
 * normalisation: profiles store `releaseBuild` (camelCase) while gate names
 * use `release-build`, and all gate consumers must resolve both.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveProfileCommand,
} = require("../scripts/tctbp-gates");

test("resolveProfileCommand resolves the camelCase releaseBuild key", () => {
  const commands = {
    format: null,
    test: "npm test",
    lint: null,
    build: "npm run build",
    releaseBuild: "npm run build -- --release",
  };
  assert.equal(resolveProfileCommand(commands, "release-build"), "npm run build -- --release");
  assert.equal(resolveProfileCommand(commands, "releaseBuild"), "npm run build -- --release");
});

test("resolveProfileCommand prefers the exact gate-name key when present", () => {
  const commands = {
    "release-build": "exact-spelling",
    releaseBuild: "camel-spelling",
  };
  assert.equal(resolveProfileCommand(commands, "release-build"), "exact-spelling");
});

test("resolveProfileCommand returns null for unconfigured gates", () => {
  assert.equal(resolveProfileCommand({}, "release-build"), null);
  assert.equal(resolveProfileCommand(null, "test"), null);
  assert.equal(resolveProfileCommand({ format: null, test: "npm test" }, "lint"), null);
});
