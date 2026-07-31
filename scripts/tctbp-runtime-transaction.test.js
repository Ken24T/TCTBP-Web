"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  RuntimePublishError,
  publishRuntimeTransaction,
  snapshotTree,
  verifyCopiedTree
} = require("./tctbp-runtime-transaction");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-runtime-transaction-"));
  const sourceDist = path.join(root, "build-output");
  const destinationDist = path.join(root, "runtime", "bundle");
  const backupPath = path.join(root, "archive", "success", "bundle");
  const stagingPath = path.join(root, "runtime", ".staging");
  const failedPath = path.join(root, "archive", "failed", "bundle");
  const runtimeStatePath = path.join(root, "runtime-state.json");
  fs.mkdirSync(path.join(sourceDist, "assets"), { recursive: true });
  fs.writeFileSync(path.join(sourceDist, "app.js"), "new bundle");
  fs.writeFileSync(path.join(sourceDist, "assets", "main.js"), "new asset");
  fs.mkdirSync(destinationDist, { recursive: true });
  fs.writeFileSync(path.join(destinationDist, "app.js"), "old bundle");
  fs.writeFileSync(runtimeStatePath, JSON.stringify({ staging: { commit: "old" } }));
  return { root, sourceDist, destinationDist, backupPath, stagingPath, failedPath, runtimeStatePath, nextRuntimeState: { staging: { commit: "new" } } };
}

function cleanup(item) {
  fs.rmSync(item.root, { recursive: true, force: true });
}

test("snapshots and publishes a generic bundle without hardcoded entrypoint assumptions", () => {
  const item = fixture();
  const calls = [];
  try {
    const sourceSnapshot = snapshotTree(item.sourceDist);
    assert.equal(sourceSnapshot["assets/main.js"].type, "file");
    const result = publishRuntimeTransaction({
      ...item,
      stopRuntime: () => calls.push("stop"),
      startAndVerifyRuntime: () => calls.push("start")
    });
    assert.deepEqual(calls, ["stop", "start"]);
    assert.equal(result.rolledBack, false);
    verifyCopiedTree(item.sourceDist, item.destinationDist);
    assert.equal(fs.readFileSync(path.join(item.destinationDist, "app.js"), "utf8"), "new bundle");
    assert.equal(fs.readFileSync(path.join(item.backupPath, "app.js"), "utf8"), "old bundle");
    assert.deepEqual(JSON.parse(fs.readFileSync(item.runtimeStatePath, "utf8")), item.nextRuntimeState);
  } finally {
    cleanup(item);
  }
});

test("rolls back the candidate and metadata when runtime verification fails", () => {
  const item = fixture();
  let starts = 0;
  try {
    assert.throws(() => publishRuntimeTransaction({
      ...item,
      stopRuntime: () => {},
      startAndVerifyRuntime: () => {
        starts += 1;
        if (starts === 1) throw new Error("health check failed");
        assert.equal(fs.readFileSync(path.join(item.destinationDist, "app.js"), "utf8"), "old bundle");
      }
    }), (error) => {
      assert.equal(error instanceof RuntimePublishError, true);
      assert.match(error.message, /previous runtime was restored and verified/);
      assert.equal(error.rollback.runtimeRestored, true);
      return true;
    });
    assert.equal(starts, 2);
    assert.equal(fs.readFileSync(path.join(item.destinationDist, "app.js"), "utf8"), "old bundle");
    assert.equal(fs.readFileSync(path.join(item.failedPath, "app.js"), "utf8"), "new bundle");
    assert.deepEqual(JSON.parse(fs.readFileSync(item.runtimeStatePath, "utf8")), { staging: { commit: "old" } });
  } finally {
    cleanup(item);
  }
});

test("validates only an explicitly configured entrypoint and leaves runtime untouched on failure", () => {
  const item = fixture();
  let calls = 0;
  try {
    assert.throws(() => publishRuntimeTransaction({
      ...item,
      entrypoint: "index.html",
      stopRuntime: () => { calls += 1; },
      startAndVerifyRuntime: () => { calls += 1; }
    }), /Missing configured runtime entrypoint/);
    assert.equal(calls, 0);
  } finally {
    cleanup(item);
  }
});
