const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveStatusRecommendations } = require("../scripts/tctbp-output");

function makeInput(overrides = {}) {
  return {
    currentBranch: "development",
    currentRemoteExists: true,
    currentSyncState: { ahead: 0, behind: 0, diverged: false },
    defaultBranch: "main",
    operationStates: [],
    shipReadiness: { ready: false },
    workingTreeSummary: { isClean: true },
    enableHandoverSuggestions: false,
    ...overrides
  };
}

test("active git operations suppress incompatible recommendations", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      operationStates: ["merge"],
      currentSyncState: { ahead: 2, behind: 0, diverged: false },
      workingTreeSummary: { isClean: false }
    })
  );

  assert.deepEqual(result, ["abort"]);
});

test("divergence requires investigation and never recommends resume", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      currentSyncState: { ahead: 2, behind: 3, diverged: true }
    })
  );

  assert.deepEqual(result, ["investigate"]);
});

test("detached HEAD requires investigation", () => {
  const result = resolveStatusRecommendations(
    makeInput({ currentBranch: "HEAD", currentRemoteExists: false })
  );

  assert.deepEqual(result, ["investigate"]);
});

test("dirty plus behind requires investigation", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      currentSyncState: { ahead: 0, behind: 2, diverged: false },
      workingTreeSummary: { isClean: false }
    })
  );

  assert.deepEqual(result, ["investigate"]);
});

test("dirty work recommends checkpoint", () => {
  const result = resolveStatusRecommendations(
    makeInput({ workingTreeSummary: { isClean: false } })
  );

  assert.deepEqual(result, ["checkpoint"]);
});

test("clean behind branch recommends resume", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      currentSyncState: { ahead: 0, behind: 2, diverged: false }
    })
  );

  assert.deepEqual(result, ["resume"]);
});

test("clean ahead branch recommends publish", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      currentSyncState: { ahead: 2, behind: 0, diverged: false }
    })
  );

  assert.deepEqual(result, ["publish"]);
});

test("handover intent replaces checkpoint or publish when safe", () => {
  const result = resolveStatusRecommendations(
    makeInput({
      workingTreeSummary: { isClean: false },
      enableHandoverSuggestions: true
    })
  );

  assert.deepEqual(result, ["handover"]);
});

test("healthy repositories need no immediate action", () => {
  assert.deepEqual(resolveStatusRecommendations(makeInput()), ["none"]);
});
