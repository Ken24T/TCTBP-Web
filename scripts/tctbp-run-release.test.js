"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  createReleaseState,
  markStageCompleted
} = require("./tctbp-release-state");
const {
  initialiseReleaseJournal,
  parseArgs,
  planReleaseStages
} = require("./tctbp-run-release");

const candidate = { branch: "development", commit: "a".repeat(40), tree: "b".repeat(40) };

function config() {
  return {
    releaseState: {
      path: ".tctbp-runtime/release-state.json",
      kind: "tctbp-release-state",
      stageOrder: [
        "preflight-gates",
        "development-deployed",
        "staging-promoted",
        "staging-deployed",
        "production-promoted",
        "shipped",
        "production-deployed",
        "finalized"
      ]
    }
  };
}

test("initialises a live release journal atomically and keeps dry-run read-only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-run-release-"));
  try {
    const statePath = path.join(root, ".tctbp-runtime", "release-state.json");
    const live = initialiseReleaseJournal({
      config: config(),
      version: "1.2.3",
      docsNoteKind: "no-docs-impact",
      docsNote: "Test release.",
      stopAt: "production",
      originalBranch: "development",
      dryRun: false,
      statePath
    });

    assert.equal(live.state.status, "in-progress");
    assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).workflowId, live.state.workflowId);
    assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);

    const dryPath = path.join(root, ".tctbp-runtime", "dry-run-state.json");
    const dry = initialiseReleaseJournal({
      config: config(),
      version: "9.9.9",
      docsNoteKind: "no-docs-impact",
      docsNote: "Dry run.",
      stopAt: "production",
      originalBranch: "development",
      dryRun: true,
      statePath: dryPath
    });
    assert.equal(dry.state, null);
    assert.equal(fs.existsSync(dryPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plans completed stages and resumes at the next incomplete stage", () => {
  let state = createReleaseState({
    version: "1.2.3",
    docsNoteKind: "no-docs-impact",
    docsNote: "Resume plan.",
    originalBranch: "development",
    config: config()
  });
  state = markStageCompleted(state, "preflight-gates", { developmentCandidate: candidate });
  state = markStageCompleted(state, "development-deployed", { developmentCandidate: candidate });

  const plan = planReleaseStages(state, config());
  assert.equal(plan.nextStage, "staging-promoted");
  assert.deepEqual(plan.completedStages, ["preflight-gates", "development-deployed"]);
  assert.deepEqual(plan.stages.slice(0, 3), [
    { stage: "preflight-gates", complete: true },
    { stage: "development-deployed", complete: true },
    { stage: "staging-promoted", complete: false }
  ]);
});

test("parses resume without requiring a replacement docs note", () => {
  assert.deepEqual(parseArgs(["--resume", "--dry-run", "--yes"]), {
    docsNoteKind: null,
    docsNote: null,
    version: null,
    resume: true,
    dryRun: true,
    yes: true,
    stopAt: null,
    list: false
  });
});
