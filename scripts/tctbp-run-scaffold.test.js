"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const SCRIPTS_DIR = __dirname;
const ROOT = path.join(SCRIPTS_DIR, "..");

test("scripts/package.json pins CommonJS for the runner scripts", () => {
  const scriptsPkgPath = path.join(SCRIPTS_DIR, "package.json");
  assert.ok(fs.existsSync(scriptsPkgPath), "scripts/package.json should exist in canonical");
  const scriptsPkg = JSON.parse(fs.readFileSync(scriptsPkgPath, "utf8"));
  assert.equal(scriptsPkg.type, "commonjs", "scripts/package.json must set type=commonjs");
});

test("RUNNER_FILES includes package.json so consumers receive the CommonJS pin", () => {
  const scaffoldSource = fs.readFileSync(path.join(SCRIPTS_DIR, "tctbp-run-scaffold.js"), "utf8");
  const match = /const\s+RUNNER_FILES\s*=\s*\[([\s\S]*?)\]\s*;/.exec(scaffoldSource);
  assert.ok(match, "RUNNER_FILES array should exist in the scaffold runner");
  assert.ok(
    match[1].includes('"package.json"'),
    "RUNNER_FILES should include package.json so the CommonJS pin is copied to consumers",
  );
});

test("runner scripts load as CommonJS even when the consumer root package.json is ESM", () => {
  // Reproduces the canasta-scoreboard failure: a Vite/React app with
  // "type": "module" in package.json previously broke every CJS runner script
  // with 'require is not defined in ES module scope'.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-esm-consumer-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "esm-consumer", type: "module" }, null, 2),
    );
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.writeFileSync(
      path.join(dir, "scripts", "package.json"),
      JSON.stringify({ type: "commonjs" }, null, 2),
    );
    // The runner under test requires tctbp-runtime; copy both so require() resolves.
    fs.copyFileSync(path.join(SCRIPTS_DIR, "tctbp-runtime.js"), path.join(dir, "scripts", "tctbp-runtime.js"));
    fs.writeFileSync(
      path.join(dir, "scripts", "probe.js"),
      'const { resolveRepoRoot } = require("./tctbp-runtime");\nprocess.stdout.write(resolveRepoRoot() === "' + dir.replace(/\\/g, "\\\\") + '" ? "cjs-ok" : "cjs-mismatch");\n',
    );
    const result = require("child_process").execFileSync(
      process.execPath,
      ["scripts/probe.js"],
      { cwd: dir, encoding: "utf8" },
    );
    assert.equal(result.trim(), "cjs-ok", "runner script should load as CommonJS under an ESM root package.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
