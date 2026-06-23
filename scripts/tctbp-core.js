#!/usr/bin/env node

const path = require("path");
const { resolvePolicyPath, resolveRepoRoot, resolveRuntimeCwd } = require("./tctbp-runtime");

const repoRoot = resolveRepoRoot();
const policyPath = resolvePolicyPath(repoRoot);
const runtimeCwd = resolveRuntimeCwd(repoRoot);

// Re-export from sub-modules — single import surface for all runners.
const gitOps = require("./tctbp-git-ops");
const profileIO = require("./tctbp-profile-io");
const output = require("./tctbp-output");
const gates = require("./tctbp-gates");

module.exports = {
  // Resolved paths (used by runners that need them directly)
  path,
  policyPath,
  repoRoot,
  runtimeCwd,

  // Git operations
  classifyStatusLine: gitOps.classifyStatusLine,
  detectGitOperationState: gitOps.detectGitOperationState,
  fetchOrigin: gitOps.fetchOrigin,
  getCurrentBranch: gitOps.getCurrentBranch,
  getDefaultRemote: gitOps.getDefaultRemote,
  getHeadCommit: gitOps.getHeadCommit,
  getHeadSummary: gitOps.getHeadSummary,
  getShortRef: gitOps.getShortRef,
  getWorkingTreeStatus: gitOps.getWorkingTreeStatus,
  gitLocalBranchExists: gitOps.gitLocalBranchExists,
  gitRefExists: gitOps.gitRefExists,
  gitRemoteBranchExists: gitOps.gitRemoteBranchExists,
  gitRemoteTagExists: gitOps.gitRemoteTagExists,
  inspectBranchSyncState: gitOps.inspectBranchSyncState,
  runCommand: gitOps.runCommand,
  runGitCapture: gitOps.runGitCapture,
  runMutableGit: gitOps.runMutableGit,
  runShellCommand: gitOps.runShellCommand,
  stopIfBehindOrDiverged: gitOps.stopIfBehindOrDiverged,

  // Profile I/O and semver
  getReleaseTagGlob: profileIO.getReleaseTagGlob,
  getReleaseTagPattern: profileIO.getReleaseTagPattern,
  loadPolicy: profileIO.loadPolicy,
  maybeReadJsonFile: profileIO.maybeReadJsonFile,
  parseSemVer: profileIO.parseSemVer,
  readJsonFile: profileIO.readJsonFile,
  readVersionSource: profileIO.readVersionSource,
  resolveRepoPath: profileIO.resolveRepoPath,
  resolveTarget: profileIO.resolveTarget,
  stepSemVer: profileIO.stepSemVer,
  updateJsonFileRaw: profileIO.updateJsonFileRaw,

  // Output and formatting
  createTimestamp: output.createTimestamp,
  escapeRegExp: output.escapeRegExp,
  escapeTableCell: output.escapeTableCell,
  fail: output.fail,
  formatSyncStatus: output.formatSyncStatus,
  logItem: output.logItem,
  logSection: output.logSection,
  printDirtySummary: output.printDirtySummary,
  printSummaryTable: output.printSummaryTable,
  resolveStatusRecommendations: output.resolveStatusRecommendations,
  summariseWorkingTree: output.summariseWorkingTree,

  // Gates
  runBuildGate: gates.runBuildGate,
  runShipGates: gates.runShipGates,
  runVerificationGates: gates.runVerificationGates,

  // Legacy — resolve tag from HEAD using git ops + profile IO
  getReachableReleaseTag(config, refName = "HEAD") {
    const tag = gitOps.tryGitCapture(["describe", "--tags", "--abbrev=0", "--match", profileIO.getReleaseTagGlob(config), refName]);
    return tag && profileIO.getReleaseTagPattern(config).test(tag) ? tag : null;
  },

  getTagsPointingAtHead(config) {
    const releaseTagPattern = profileIO.getReleaseTagPattern(config);
    const tags = gitOps.runGitCapture(["tag", "--points-at", "HEAD"], "Inspect release tags at HEAD", true);

    return tags
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && releaseTagPattern.test(value));
  }
};
