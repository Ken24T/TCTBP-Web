"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const {
  inspectDeletionImpact,
  inspectMergePreflight,
  isMergeInProgress,
  recoverFailedMerge
} = require("./tctbp-promotion-safety");

function git(repoRoot, args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!allowFailure && result.status !== 0) throw new Error(String(result.stderr || result.stdout));
  return result;
}

function write(root, name, content) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-promotion-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "TCTBP Test"]);
  git(root, ["config", "user.email", "tctbp@example.invalid"]);
  write(root, "shared.txt", "base\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("parses a read-only merge candidate and deletion impact", () => {
  const root = createRepo();
  try {
    write(root, "obsolete.txt", "one\ntwo\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "add obsolete"]);
    git(root, ["switch", "-c", "staging"]);
    fs.unlinkSync(path.join(root, "obsolete.txt"));
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "remove obsolete"]);
    git(root, ["switch", "main"]);
    write(root, "target.txt", "target\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "target"]);

    const preflight = inspectMergePreflight({ repoRoot: root, targetRef: "main", sourceRef: "staging" });
    assert.equal(preflight.mergeable, true);
    assert.match(preflight.treeSha, /^[0-9a-f]{40,64}$/);
    const impact = inspectDeletionImpact({ repoRoot: root, baseRef: "main", candidateRef: preflight.treeSha });
    assert.deepEqual(impact.deletedFiles, ["obsolete.txt"]);
    assert.equal(impact.removedLines, 2);
    assert.equal(isMergeInProgress(root), false);
  } finally {
    cleanup(root);
  }
});

test("recovers a failed merge without leaving merge metadata behind", () => {
  const root = createRepo();
  try {
    git(root, ["switch", "-c", "staging"]);
    write(root, "shared.txt", "staging\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "staging"]);
    git(root, ["switch", "main"]);
    write(root, "shared.txt", "main\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "main"]);
    assert.notEqual(git(root, ["merge", "--no-ff", "--no-commit", "staging"], true).status, 0);
    assert.equal(isMergeInProgress(root), true);
    const recovery = recoverFailedMerge({ repoRoot: root, sourceBranch: "staging", targetBranch: "main" });
    assert.equal(recovery.ok, true);
    assert.equal(recovery.abortedMerge, true);
    assert.equal(recovery.returnedToSource, true);
    assert.equal(isMergeInProgress(root), false);
  } finally {
    cleanup(root);
  }
});
