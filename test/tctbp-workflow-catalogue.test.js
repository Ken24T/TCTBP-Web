"use strict";

/**
 * test/tctbp-workflow-catalogue.test.js
 *
 * Phase 2 (consistency hardening) tests for the canonical workflow catalogue.
 *
 * These tests implement the Phase 2 acceptance gate: they catch the currently
 * known discrepancies (D1-D7 from the Phase 1 audit matrix) via a pinned
 * violation set, so that Phase 3 semantic fixes must update the pin together
 * with the code.
 *
 * See docs/plans/tctbp-ecosystem-audit-matrix.md for the discrepancy list.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  PUBLIC_WORKFLOWS,
  INTERNAL_WORKFLOWS,
  allWorkflows,
  resolveWorkflowForTrigger,
  auditCatalogue,
} = require("../scripts/tctbp-workflow-catalogue");
const { RUNNER_FILES: SCAFFOLD_RUNNER_FILES } = require("../scripts/tctbp-managed-surface");

const projectRoot = path.resolve(__dirname, "..");

function loadProfile() {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".github", "TCTBP.json"), "utf8")
  );
}

/** Scaffold managed-surface inventory (shared manifest is the single source). */
function extractScaffoldRunnerFiles() {
  return SCAFFOLD_RUNNER_FILES;
}

/** Extract the agent activation frontmatter (between leading --- fences). */
function extractAgentFrontmatter() {
  const src = fs.readFileSync(
    path.join(projectRoot, ".github", "agents", "TCTBP.agent.md"),
    "utf8"
  );
  const match = src.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

function existingRunnerBasenames() {
  const dir = path.join(projectRoot, "scripts");
  return fs
    .readdirSync(dir)
    .filter((file) => file.startsWith("tctbp-run-") && file.endsWith(".js"));
}

function audit() {
  return auditCatalogue(loadProfile(), {
    scaffoldRunnerFiles: extractScaffoldRunnerFiles(),
    agentFrontmatter: extractAgentFrontmatter(),
    existingRunners: existingRunnerBasenames(),
  });
}

function violationKey(violation) {
  return `${violation.code}@${violation.workflowId || "-"}`;
}

// ---------------------------------------------------------------------------
// Catalogue structure
// ---------------------------------------------------------------------------

test("catalogue has unique workflow ids", () => {
  const ids = allWorkflows().map((workflow) => workflow.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test("no alias is owned by two workflows", () => {
  const seen = new Map();
  const duplicates = [];
  for (const workflow of allWorkflows()) {
    for (const alias of workflow.aliases) {
      const key = alias.toLowerCase();
      if (seen.has(key)) {
        duplicates.push(`${key} (${seen.get(key)} vs ${workflow.id})`);
      } else {
        seen.set(key, workflow.id);
      }
    }
  }
  assert.deepEqual(duplicates, []);
});

test("every public runner path exists on disk", () => {
  const missing = PUBLIC_WORKFLOWS.filter((workflow) => workflow.runner)
    .map((workflow) => workflow.runner)
    .filter((runnerPath) => !fs.existsSync(path.join(projectRoot, runnerPath)));
  assert.deepEqual(missing, []);
});

test("internal dispatcher is not advertised as a public activation trigger", () => {
  const profile = loadProfile();
  const triggers = (profile.activation.triggers || []).map((trigger) =>
    trigger.toLowerCase()
  );
  assert.ok(
    INTERNAL_WORKFLOWS.some((workflow) => workflow.id === "workflow"),
    "catalogue must include the workflow dispatcher as internal"
  );
  assert.equal(
    triggers.includes("workflow"),
    false,
    "internal dispatcher must not appear in activation.triggers"
  );
});

// ---------------------------------------------------------------------------
// Activation / alias consistency
// ---------------------------------------------------------------------------

test("every activation trigger resolves to exactly one workflow", () => {
  const profile = loadProfile();
  const violations = audit().filter(
    (violation) =>
      violation.code === "unknown-trigger" || violation.code === "duplicate-owner"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `orphan or duplicated triggers detected:\n${JSON.stringify(violations, null, 2)}`
  );
});

test("every public alias is activated", () => {
  const profile = loadProfile();
  const triggers = new Set(
    (profile.activation.triggers || []).map((trigger) => trigger.toLowerCase())
  );
  for (const workflow of PUBLIC_WORKFLOWS) {
    if (workflow.viaBranchCommand) {
      assert.equal(
        !!(profile.activation.branchCommand && profile.activation.branchCommand.enabled),
        true,
        `branchCommand must be enabled for "${workflow.id}"`
      );
      continue;
    }
    const missing = workflow.aliases.filter(
      (alias) => !triggers.has(alias.toLowerCase())
    );
    assert.deepEqual(
      missing,
      [],
      `workflow "${workflow.id}" has aliases that are not activated: ${missing.join(", ")}`
    );
  }
});

test("resolveWorkflowForTrigger maps known phrases and branch command", () => {
  const profile = loadProfile();
  assert.equal(resolveWorkflowForTrigger("ship", profile), "ship");
  assert.equal(resolveWorkflowForTrigger("gate build", profile), "gate");
  assert.equal(resolveWorkflowForTrigger("version status", profile), "version");
  assert.equal(
    resolveWorkflowForTrigger("branch", profile),
    "branch",
    "branchCommand pattern must resolve the branch workflow"
  );
  assert.equal(
    resolveWorkflowForTrigger("totally unknown phrase", profile),
    null
  );
});

// ---------------------------------------------------------------------------
// Runner existence
// ---------------------------------------------------------------------------

test("every scaffold-managed public runner exists in the scripts directory", () => {
  const existing = existingRunnerBasenames();
  const missing = PUBLIC_WORKFLOWS.filter(
    (workflow) => workflow.scaffoldManaged && workflow.runner
  )
    .map((workflow) => path.basename(workflow.runner))
    .filter((basename) => !existing.includes(basename));
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------
// Scaffold managed-surface consistency
// ---------------------------------------------------------------------------

test("every scaffold-managed public runner is in the scaffold inventory (D5 resolved)", () => {
  const scaffoldInventory = extractScaffoldRunnerFiles();
  const violations = audit().filter(
    (violation) => violation.code === "scaffold-surface-gap"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `unexpected scaffold surface gaps:\n${JSON.stringify(violations, null, 2)}`
  );
  assert.equal(
    scaffoldInventory.includes("tctbp-run-hotfix.js"),
    true,
    "hotfix runner must be present in the scaffold RUNNER_FILES inventory"
  );
});

// ---------------------------------------------------------------------------
// Agent frontmatter coverage
// ---------------------------------------------------------------------------

test("agent activation frontmatter covers every public workflow", () => {
  const violations = audit().filter(
    (violation) => violation.code === "agent-frontmatter-gap"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `unexpected agent frontmatter gaps:\n${JSON.stringify(violations, null, 2)}`
  );
});

// ---------------------------------------------------------------------------
// Adviser vocabulary consistency
// ---------------------------------------------------------------------------

test("adviserVocabulary covers every public workflow", () => {
  const violations = audit().filter(
    (violation) => violation.code === "adviser-vocab-gap"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `unexpected adviser vocabulary gaps:\n${JSON.stringify(violations, null, 2)}`
  );
});

test("adviserVocabulary contains no unknown workflow ids", () => {
  const profile = loadProfile();
  const violations = audit().filter(
    (violation) => violation.code === "adviser-vocab-unknown"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `unexpected unknown ids in adviserVocabulary:\n${JSON.stringify(violations, null, 2)}`
  );
});

// ---------------------------------------------------------------------------
// Profile section ownership
// ---------------------------------------------------------------------------

test("profile workflow sections own exactly their catalogue triggers (D3 resolved)", () => {
  const violations = audit().filter(
    (violation) => violation.code === "section-trigger-mismatch"
  );
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `unexpected section trigger mismatches:\n${JSON.stringify(violations, null, 2)}`
  );
});

// ---------------------------------------------------------------------------
// Known-gap set (Phase 2 acceptance gate → Phase 3 resolution)
// ---------------------------------------------------------------------------

test("consistency audit reports zero discrepancies (D1-D7 all resolved)", () => {
  const violations = audit();
  assert.deepEqual(
    violations.map(violationKey).sort(),
    [],
    `Consistency audit must be clean after Phase 3. Actual:\n${JSON.stringify(violations, null, 2)}`
  );
});

// ---------------------------------------------------------------------------
// Preflight runner smoke test
// ---------------------------------------------------------------------------

test("preflight dry-run loads and plans without mutating the repository", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/tctbp-run-preflight.js", "--dry-run"],
    { cwd: projectRoot, encoding: "utf8" }
  );
  assert.equal(
    result.status,
    0,
    `preflight --dry-run failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /Preflight summary: PASS/);
});
