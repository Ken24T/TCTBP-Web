"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const policyPath = path.join(projectRoot, ".github", "TCTBP.json");

test("canonical policy has unique top-level keys", () => {
  const source = fs.readFileSync(policyPath, "utf8");
  const keys = [...source.matchAll(/^  "([^"]+)":/gm)].map(
    (match) => match[1]
  );
  const duplicates = [
    ...new Set(keys.filter((key, index) => keys.indexOf(key) !== index)),
  ];

  assert.deepEqual(
    duplicates,
    [],
    "duplicate top-level TCTBP policy keys: " + duplicates.join(", ")
  );
});

test("canonical policy remains valid and identifies its source of truth", () => {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));

  assert.equal(Number.isInteger(policy.schemaVersion), true);
  assert.equal(policy.governance.sourceOfTruth, "TCTBP.json");
  assert.equal(policy.governance.templateMode, true);
});
