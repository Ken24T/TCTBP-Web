"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  RELEASE_STAGE_ORDER,
  buildResumePlan,
  createReleaseState,
  markReleaseFailed,
  markReleasePaused,
  markStageCompleted,
  markStageStarted,
  migrateReleaseState,
  readReleaseState,
  validateReleaseState,
  writeReleaseStateAtomic
} = require("./tctbp-release-state");

function fixture(extra = {}) {
  return createReleaseState({
    version: "1.2.3",
    docsNoteKind: "no-docs-impact",
    docsNote: "Hardening tests.",
    originalBranch: "development",
    now: new Date("2026-08-01T03:00:00.000Z"),
    ...extra
  });
}

test("enforces release stage transitions and preserves evidence on failure", () => {
  const initial = fixture();
  assert.deepEqual(validateReleaseState(initial), []);
  assert.equal(buildResumePlan(initial).nextStage, "preflight-gates");
  assert.throws(() => markStageCompleted(initial, "staging-promoted"), /before 'preflight-gates'/);
  const started = markStageStarted(initial, "preflight-gates");
  const complete = markStageCompleted(started, "preflight-gates", { candidate: "captured" });
  assert.equal(complete.lastCompletedStage, "preflight-gates");
  const paused = markReleasePaused(complete, "waiting for staging approval");
  const failed = markReleaseFailed(paused, "development-deployed", new Error("deploy failed"));
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.message, "deploy failed");
  assert.equal(failed.completedStages["preflight-gates"].evidence.candidate, "captured");
});

test("migrates schema one and supports configured staging state machinery", () => {
  const legacy = fixture();
  legacy.schemaVersion = 1;
  const migrated = migrateReleaseState(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(validateReleaseState(migrated), []);

  const config = {
    releaseState: {
      path: ".custom-runtime/state.json",
      kind: "custom-release-state",
      stageOrder: ["preflight", "staging", "production"]
    }
  };
  const custom = fixture({ config });
  assert.equal(custom.kind, "custom-release-state");
  assert.deepEqual(custom.stageOrder, ["preflight", "staging", "production"]);
  assert.equal(buildResumePlan(custom, { config }).nextStage, "preflight");
  assert.deepEqual(validateReleaseState(custom, { config }), []);
});

test("writes release state atomically with private mode and no temporary file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-release-state-"));
  try {
    const statePath = path.join(root, ".tctbp-runtime", "release-state.json");
    writeReleaseStateAtomic(statePath, fixture());
    assert.deepEqual(readReleaseState(statePath), fixture());
    assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(statePath)).filter((name) => name.endsWith(".tmp")), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test("completes the configured default order monotonically", () => {
  let state = fixture();
  for (const stage of RELEASE_STAGE_ORDER) state = markStageCompleted(state, stage, { checked: true });
  assert.equal(state.status, "completed");
  assert.equal(buildResumePlan(state).nextStage, null);
  assert.equal(buildResumePlan(state).resumable, false);
});
