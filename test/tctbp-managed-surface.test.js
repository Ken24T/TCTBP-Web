"use strict";

/**
 * test/tctbp-managed-surface.test.js
 *
 * Phase 4 (shared managed-surface manifest) consistency tests.
 *
 * Verifies that the canonical manifest is internally consistent, that every
 * listed file exists, that the scaffold-managed runner surface matches the
 * public workflow catalogue, and that generated profiles and source metadata
 * carry the canonical contract.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  RUNNER_FILES,
  GITHUB_FILES,
  PROMPT_FILES,
  CONTRACT_FILES,
  ACTIVATION_TRIGGERS,
  MANAGED_SURFACE,
  createSourceMetadata
} = require("../scripts/tctbp-managed-surface");
const { PUBLIC_WORKFLOWS } = require("../scripts/tctbp-workflow-catalogue");
const { generateProfile } = require("../scripts/tctbp-scaffold-profile");

const projectRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Manifest structure
// ---------------------------------------------------------------------------

test("every manifest-listed file exists on disk", () => {
  const missing = [];
  for (const file of RUNNER_FILES) {
    if (!fs.existsSync(path.join(projectRoot, "scripts", file))) {
      missing.push(`scripts/${file}`);
    }
  }
  for (const file of GITHUB_FILES) {
    if (!fs.existsSync(path.join(projectRoot, ".github", file))) {
      missing.push(`.github/${file}`);
    }
  }
  for (const file of PROMPT_FILES) {
    if (!fs.existsSync(path.join(projectRoot, ".github", "prompts", file))) {
      missing.push(`.github/prompts/${file}`);
    }
  }
  for (const file of CONTRACT_FILES) {
    if (!fs.existsSync(path.join(projectRoot, file))) {
      missing.push(file);
    }
  }
  assert.deepEqual(missing, [], `manifest lists missing files: ${missing.join(", ")}`);
});

test("manifest inventories contain no duplicate entries", () => {
  for (const [label, list] of [
    ["RUNNER_FILES", RUNNER_FILES],
    ["GITHUB_FILES", GITHUB_FILES],
    ["PROMPT_FILES", PROMPT_FILES],
    ["CONTRACT_FILES", CONTRACT_FILES]
  ]) {
    const duplicates = list.filter((entry, index) => list.indexOf(entry) !== index);
    assert.deepEqual(duplicates, [], `${label} contains duplicates: ${duplicates.join(", ")}`);
  }
});

test("activation triggers are unique", () => {
  const duplicates = ACTIVATION_TRIGGERS.filter(
    (trigger, index) => ACTIVATION_TRIGGERS.indexOf(trigger) !== index
  );
  assert.deepEqual(duplicates, []);
});

test("activation triggers cover every public workflow family", () => {
  const triggers = new Set(ACTIVATION_TRIGGERS.map((trigger) => trigger.toLowerCase()));
  for (const workflow of PUBLIC_WORKFLOWS) {
    if (workflow.viaBranchCommand) {
      continue; // branch is pattern-triggered
    }
    if (workflow.id === "scaffold") {
      continue; // scaffold is the factory itself; its triggers are not generated into new projects
    }
    const missing = workflow.aliases.filter((alias) => !triggers.has(alias.toLowerCase()));
    assert.deepEqual(
      missing,
      [],
      `generated activation triggers omit aliases for "${workflow.id}": ${missing.join(", ")}`
    );
  }
});

test("managed surface matches the manifest inventories", () => {
  const expected = [
    ...RUNNER_FILES.map((file) => `scripts/${file}`),
    ...GITHUB_FILES.map((file) => `.github/${file}`),
    ...PROMPT_FILES.map((file) => `.github/prompts/${file}`),
    ...CONTRACT_FILES
  ];
  assert.deepEqual(MANAGED_SURFACE, expected);
});

// ---------------------------------------------------------------------------
// Scaffold runner surface vs canonical catalogue
// ---------------------------------------------------------------------------

test("every scaffold-managed public runner is in the manifest inventory", () => {
  const inventory = new Set(RUNNER_FILES);
  const missing = PUBLIC_WORKFLOWS.filter(
    (workflow) => workflow.scaffoldManaged && workflow.runner
  )
    .map((workflow) => path.basename(workflow.runner))
    .filter((basename) => !inventory.has(basename));
  assert.deepEqual(missing, [], `scaffold-managed runners missing from manifest: ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Source metadata
// ---------------------------------------------------------------------------

test("createSourceMetadata produces the canonical source metadata shape", () => {
  const metadata = createSourceMetadata({
    sourceRepository: "Ken24T/TCTBP-Web",
    sourceRevision: "4f46c48abc",
    sourceVersion: "0.3.6",
    schemaVersion: 11,
    adviserContract: { major: 1, minor: 0, capabilities: [] },
    installedAt: "2026-08-13"
  });

  assert.equal(metadata.sourceRepository, "Ken24T/TCTBP-Web");
  assert.equal(metadata.sourceRevision, "4f46c48abc");
  assert.equal(metadata.sourceVersion, "0.3.6");
  assert.equal(metadata.installedSchemaVersion, 11);
  assert.deepEqual(metadata.adviserContract, { major: 1, minor: 0, capabilities: [] });
  assert.deepEqual(metadata.managedSurface, MANAGED_SURFACE);
  assert.equal(metadata.installedAt, "2026-08-13");
});

test("generated profile carries the canonical activation surface", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-manifest-"));
  const targetPath = path.join(dir, "project");
  fs.mkdirSync(path.join(targetPath, ".github"), { recursive: true });

  generateProfile({
    projectName: "manifest-test",
    targetPath,
    workingBranch: "development",
    branchStrategy: "staged",
    framework: "vite",
    deployTarget: "none yet",
    testFramework: "vitest"
  });

  const profile = JSON.parse(
    fs.readFileSync(path.join(targetPath, ".github", "TCTBP.json"), "utf8")
  );
  assert.deepEqual(profile.activation.triggers, ACTIVATION_TRIGGERS);
  assert.equal(profile.schemaVersion, 11);
  assert.equal(profile.adviserContract.major, 1);
  assert.equal(profile.activation.caseInsensitive, true);
});
