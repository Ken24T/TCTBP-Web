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
const candidateGuard = require("./tctbp-candidate-guard");
const promotionSafety = require("./tctbp-promotion-safety");
const releaseState = require("./tctbp-release-state");
const releaseResume = require("./tctbp-release-resume");
const runtimeTransaction = require("./tctbp-runtime-transaction");

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

  // Candidate verification and promotion safety
  assertCandidate: candidateGuard.assertCandidate,
  assertIndexCandidateTree: candidateGuard.assertIndexCandidateTree,
  assertSyncedBranchCandidate: candidateGuard.assertSyncedBranchCandidate,
  captureSyncedBranchCandidate: candidateGuard.captureSyncedBranchCandidate,
  normaliseObjectId: candidateGuard.normaliseObjectId,
  resolveCandidate: candidateGuard.resolveCandidate,
  inspectDeletionImpact: promotionSafety.inspectDeletionImpact,
  inspectMergePreflight: promotionSafety.inspectMergePreflight,
  isMergeInProgress: promotionSafety.isMergeInProgress,
  recoverFailedMerge: promotionSafety.recoverFailedMerge,
  sumRemovedLines: promotionSafety.sumRemovedLines,

  // Profile I/O and semver
  getReleaseTagGlob: profileIO.getReleaseTagGlob,
  getReleaseTagPattern: profileIO.getReleaseTagPattern,
  loadPolicy: profileIO.loadPolicy,
  maybeReadJsonFile: profileIO.maybeReadJsonFile,
  parseSemVer: profileIO.parseSemVer,
  patchHasShipped: profileIO.patchHasShipped,
  readJsonFile: profileIO.readJsonFile,
  readVersionSource: profileIO.readVersionSource,
  resolveRepoPath: profileIO.resolveRepoPath,
  resolveTarget: profileIO.resolveTarget,
  stepSemVer: profileIO.stepSemVer,
  updateJsonFileRaw: profileIO.updateJsonFileRaw,

  // Release state, resume evidence, and runtime transactions
  RELEASE_STAGE_ORDER: releaseState.RELEASE_STAGE_ORDER,
  RELEASE_STATE_KIND: releaseState.RELEASE_STATE_KIND,
  RELEASE_STATE_RELATIVE_PATH: releaseState.RELEASE_STATE_RELATIVE_PATH,
  RELEASE_STATE_SCHEMA_VERSION: releaseState.RELEASE_STATE_SCHEMA_VERSION,
  buildResumeEvidencePlan: releaseResume.buildResumeEvidencePlan,
  buildResumePlan: releaseState.buildResumePlan,
  createReleaseState: releaseState.createReleaseState,
  getStageEvidence: releaseState.getStageEvidence,
  isStageComplete: releaseState.isStageComplete,
  markReleaseFailed: releaseState.markReleaseFailed,
  markReleasePaused: releaseState.markReleasePaused,
  markStageCompleted: releaseState.markStageCompleted,
  markStageStarted: releaseState.markStageStarted,
  migrateReleaseState: releaseState.migrateReleaseState,
  nextIncompleteStage: releaseState.nextIncompleteStage,
  readReleaseState: releaseState.readReleaseState,
  resolveReleaseSettings: releaseState.resolveReleaseSettings,
  resolveReleaseStatePath: releaseState.resolveReleaseStatePath,
  validateReleaseState: releaseState.validateReleaseState,
  writeReleaseStateAtomic: releaseState.writeReleaseStateAtomic,
  RuntimePublishError: runtimeTransaction.RuntimePublishError,
  publishRuntimeTransaction: runtimeTransaction.publishRuntimeTransaction,
  snapshotTree: runtimeTransaction.snapshotTree,
  stageRuntimeBundle: runtimeTransaction.stageRuntimeBundle,
  verifyCopiedTree: runtimeTransaction.verifyCopiedTree,

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
