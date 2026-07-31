"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const {
  assertCandidate,
  assertSyncedBranchCandidate,
  captureSyncedBranchCandidate,
  resolveCandidate
} = require("./tctbp-candidate-guard");

function git(repoRoot, args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout));
  return String(result.stdout || "").trim();
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-candidate-"));
  git(root, ["init", "-b", "development"]);
  git(root, ["config", "user.name", "TCTBP Test"]);
  git(root, ["config", "user.email", "tctbp@example.invalid"]);
  fs.writeFileSync(path.join(root, "shared.txt"), "base\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("captures a synced candidate and rejects later commit/tree drift", () => {
  const root = createRepo();
  try {
    git(root, ["branch", "staging"]);
    git(root, ["update-ref", "refs/remotes/upstream/staging", "refs/heads/staging"]);
    const candidate = captureSyncedBranchCandidate({ repoRoot: root, branch: "staging", remote: "upstream" });
    assert.deepEqual(assertSyncedBranchCandidate({ repoRoot: root, branch: "staging", remote: "upstream", expectedCommit: candidate.commit, expectedTree: candidate.tree }), candidate);

    git(root, ["switch", "staging"]);
    fs.writeFileSync(path.join(root, "later.txt"), "later\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "move candidate"]);
    git(root, ["update-ref", "refs/remotes/upstream/staging", "refs/heads/staging"]);

    assert.throws(() => assertSyncedBranchCandidate({ repoRoot: root, branch: "staging", remote: "upstream", expectedCommit: candidate.commit, expectedTree: candidate.tree }), /drifted/);
  } finally {
    cleanup(root);
  }
});

test("asserts a ref's recorded commit and tree", () => {
  const root = createRepo();
  try {
    const candidate = resolveCandidate({ repoRoot: root, ref: "HEAD" });
    assert.deepEqual(assertCandidate({ repoRoot: root, ref: "HEAD", expectedCommit: candidate.commit, expectedTree: candidate.tree }), candidate);
    assert.throws(() => assertCandidate({ repoRoot: root, ref: "HEAD", expectedCommit: "a".repeat(40), label: "release candidate" }), /moved/);
  } finally {
    cleanup(root);
  }
});
