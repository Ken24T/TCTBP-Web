"use strict";

const assert = require("assert/strict");
const test = require("node:test");
const { createReleaseState, markReleaseFailed, markStageCompleted } = require("./tctbp-release-state");
const { buildResumeEvidencePlan } = require("./tctbp-release-resume");

const developmentCandidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const stagingCandidate = { commit: "c".repeat(40), tree: "d".repeat(40) };
const productionCandidate = { commit: "e".repeat(40), tree: "f".repeat(40) };

function freshState() {
  return createReleaseState({
    version: "1.2.3",
    docsNoteKind: "no-docs-impact",
    docsNote: "Resume evidence test.",
    originalBranch: "development",
    now: new Date("2026-08-01T03:00:00.000Z")
  });
}

function complete(state, stage, evidence = {}) {
  return markStageCompleted(state, stage, evidence);
}

test("plans candidate and runtime verification before staging promotion", () => {
  let state = freshState();
  state = complete(state, "preflight-gates", { developmentCandidate });
  state = complete(state, "development-deployed", { developmentCandidate });
  state = markReleaseFailed(state, "staging-promoted", new Error("interrupted"));
  const plan = buildResumeEvidencePlan(state);
  assert.equal(plan.resume.nextStage, "staging-promoted");
  assert.deepEqual(plan.checks, [
    { type: "candidate", candidate: { branch: "development", ...developmentCandidate }, requireRemoteSync: true },
    { type: "runtime", target: "development", candidate: { branch: "development", ...developmentCandidate } }
  ]);
});

test("plans staging and production candidate/tag checks without backup assumptions", () => {
  let state = freshState();
  state = complete(state, "preflight-gates", { developmentCandidate });
  state = complete(state, "development-deployed", { developmentCandidate });
  state = complete(state, "staging-promoted", { stagingCandidate });
  state = complete(state, "staging-deployed", { stagingCandidate });
  state = complete(state, "production-promoted", { productionCandidate });
  state = complete(state, "shipped", { productionCandidate, tag: "v1.2.3" });
  state = markReleaseFailed(state, "production-deployed", new Error("interrupted"));
  const plan = buildResumeEvidencePlan(state);
  assert.deepEqual(plan.checks.map((check) => check.type), ["candidate", "tag"]);
  assert.equal(plan.checks[0].candidate.branch, "main");
  assert.equal(plan.checks.some((check) => check.type === "backup" || check.type === "restore-rehearsal"), false);
});

test("uses shipped main evidence after shipping changes the production commit", () => {
  let state = freshState();
  state = complete(state, "preflight-gates", { developmentCandidate });
  state = complete(state, "development-deployed", { developmentCandidate });
  state = complete(state, "staging-promoted", { stagingCandidate });
  state = complete(state, "staging-deployed", { stagingCandidate });
  state = complete(state, "production-promoted", { productionCandidate });
  state = complete(state, "shipped", {
    productionCandidate: { commit: "1".repeat(40), tree: "2".repeat(40) },
    tag: "v1.2.3"
  });
  state = markReleaseFailed(state, "production-deployed", new Error("interrupted"));

  const plan = buildResumeEvidencePlan(state);
  assert.deepEqual(plan.candidates.production, {
    branch: "main",
    commit: "1".repeat(40),
    tree: "2".repeat(40)
  });
});

test("rejects a completed stage without candidate evidence", () => {
  let state = freshState();
  state = complete(state, "preflight-gates");
  assert.throws(() => buildResumeEvidencePlan(state), /missing valid developmentCandidate evidence/);
});
