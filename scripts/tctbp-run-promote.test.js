"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");

const RUNNER = path.join(__dirname, "tctbp-run-promote.js");

function git(repoRoot, args, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(String(result.stderr || result.stdout));
  }
  return String(result.stdout || "").trim();
}

function runPromote(repoRoot, args) {
  // The runner resolves its repo root from TCTBP_REPO_ROOT (or its own location),
  // not from cwd — point it at the fixture repo explicitly.
  return spawnSync("node", [RUNNER, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TCTBP_REPO_ROOT: repoRoot }
  });
}

function createLongLivedRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-promote-"));
  git(root, ["init", "-b", "development"]);
  git(root, ["config", "user.name", "TCTBP Test"]);
  git(root, ["config", "user.email", "tctbp@example.invalid"]);
  fs.writeFileSync(path.join(root, "app.txt"), "base\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  git(root, ["branch", "main"]);

  // A bare remote that already has the environment branches.
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-promote-remote-"));
  git(remote, ["init", "--bare"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["push", "-u", "origin", "development"]);
  git(root, ["push", "-u", "origin", "main"]);

  // Minimal long-lived profile. Commands are null so gates are skipped.
  const config = {
    project: { name: "promote-test", defaultBranch: "main", versionFiles: ["VERSION"] },
    branchModel: {
      strategy: "long-lived-environment-branches",
      workingBranch: "development",
      reviewBranch: "review",
      productionBranch: "main"
    },
    profile: {
      versioning: { sourceOfTruth: "VERSION", tagFormat: "v{version}", formatAfterBump: false },
      commands: { test: "node -e \"\"", lint: null, build: null, format: null }
    },
    codeLossPrevention: { enabled: true, safetyTagsEnabled: true }
  };
  fs.mkdirSync(path.join(root, ".github"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".github", "TCTBP.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(root, "VERSION"), "0.1.0\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "add tctbp profile"]);
  git(root, ["push", "origin", "development"]);
  git(root, ["switch", "development"]);
  return { root, remote };
}

function cleanup(root, remote) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(remote, { recursive: true, force: true });
}

test("promote review seeds and publishes a not-yet-created review branch", () => {
  const { root, remote } = createLongLivedRepo();
  try {
    const result = runPromote(root, ["review", "--no-docs-impact", "first promote"]);
    assert.equal(
      result.status,
      0,
      `promote review exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(result.stdout, /Promote review completed|promote review completed|completed successfully/);
    // The review branch must now exist locally and on origin.
    assert.equal(git(root, ["rev-parse", "--verify", "refs/heads/review"]).length > 0, true);
    assert.equal(git(remote, ["show-ref", "--verify", "refs/heads/review"]).length > 0, true);
  } finally {
    cleanup(root, remote);
  }
});

test("promote review fails when first publish is not allowed", () => {
  const { root, remote } = createLongLivedRepo();
  try {
    // Add an explicit promote config that forbids first publication of review.
    const configPath = path.join(root, ".github", "TCTBP.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.promote = {
      targets: {
        review: {
          sourceBranch: "development",
          targetBranch: "review",
          allowFirstTargetPublish: false,
          allowDirtySourceSync: true,
          publishSourceWhenNeeded: true,
          publishTargetAfterPromotion: true,
          returnToSourceBranchAfterPromotion: true
        }
      }
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "restrict first publish"]);
    git(root, ["push", "origin", "development"]);

    const result = runPromote(root, ["review", "--no-docs-impact", "first promote"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /does not exist locally or on origin/);
  } finally {
    cleanup(root, remote);
  }
});
