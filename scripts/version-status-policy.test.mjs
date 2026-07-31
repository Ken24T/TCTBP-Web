import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateVersionStatus,
  normaliseRequiredEnvironment,
  parseVersionStatusArgs,
  resolveVersionStatusPolicy,
} from "./version-status-policy.mjs";

test("normalises configured environment aliases", () => {
  const policy = resolveVersionStatusPolicy({
    versionStatus: {
      environmentToBranch: { preview: "preview" },
      environmentAliases: { qa: "preview" },
    },
  });

  assert.equal(normaliseRequiredEnvironment("qa", policy), "preview");
  assert.deepEqual(parseVersionStatusArgs(["--strict", "--required-environment", "qa"], policy), {
    strict: true,
    requiredEnvironment: "preview",
  });
});

test("blocks only the requested environment while retaining advisory mismatches", () => {
  const policy = resolveVersionStatusPolicy();
  const result = evaluateVersionStatus({
    policy,
    requiredEnvironment: "staging",
    branchChecks: [
      { branch: "development", inSync: false },
      { branch: "staging", inSync: true },
      { branch: "main", inSync: true },
    ],
    runtimeChecks: [
      { environment: "staging", versionAligned: true, commitAligned: true },
      { environment: "production", versionAligned: false, commitAligned: false },
    ],
  });

  assert.equal(result.requiredAligned, true);
  assert.equal(result.blockingMismatches.length, 0);
  assert.equal(result.advisoryMismatches.length, 2);
});
