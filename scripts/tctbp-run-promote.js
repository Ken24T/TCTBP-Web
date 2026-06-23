#!/usr/bin/env node

const fs = require("fs");
const { spawnSync } = require("child_process");
const { captureBranchSnapshots, printPostTriggerStatusReport } = require("./tctbp-status-report");
const { resolvePolicyPath, resolveRepoRoot } = require("./tctbp-runtime");
const {
  readVersionSource,
  resolveRepoPath,
  stepSemVer,
} = require("./tctbp-core");

const RELEASE_NOTES_PATH = null; // Web template: no release notes data source
const repoRoot = resolveRepoRoot();
const policyPath = resolvePolicyPath(repoRoot);

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

if (!options.target) {
  console.error("Missing promotion target.");
  printUsage(1);
}

if (!options.docsNoteKind || !options.docsNote) {
  console.error("Exactly one docs-impact note is required. Use --docs-updated \"<reason>\" or --no-docs-impact \"<reason>\".");
  printUsage(1);
}

const policy = loadPolicy();
const resolvedTarget = resolveTarget(policy.promote.targets, options.target);

if (!resolvedTarget) {
  console.error(`Unknown promotion target '${options.target}'.`);
  printUsage(1, policy);
}

main(policy, resolvedTarget, options).catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main(config, targetInfo, cliOptions) {
  const { key, target } = targetInfo;
  const sourceBranch = target.sourceBranch;
  const targetBranch = target.targetBranch;
  const branch = getCurrentBranch();

  if (branch === "HEAD") {
    fail("Promotion stopped because HEAD is detached.");
  }

  if (branch !== sourceBranch) {
    fail(`Promotion target '${key}' requires branch '${sourceBranch}', but the current branch is '${branch}'.`);
  }

  logSection(`Promote ${key}`);
  logItem("Source branch", sourceBranch);
  logItem("Target branch", targetBranch);
  logItem("Docs impact", `${cliOptions.docsNoteKind === "docs-updated" ? "Docs updated" : "No docs impact"}: ${cliOptions.docsNote}`);
  logItem("Mode", cliOptions.dryRun ? "dry-run" : "live");

  // Storage guards removed for web template — add project-specific guards in TCTBP.json if needed.

  runMutableGit(["fetch", "--prune", "origin"], cliOptions.dryRun, "Fetch origin before promotion preflight");

  let sourceRemoteExists = gitRemoteBranchExists(sourceBranch);
  let sourceRemoteState = inspectBranchSyncState(sourceBranch, sourceRemoteExists, true);

  stopIfBehindOrDiverged(sourceRemoteState, `origin/${sourceBranch}`);

  const sourceStatusBeforeGeneratedChanges = getWorkingTreeStatus();
  const sourceWasDirtyBeforeGeneratedChanges = sourceStatusBeforeGeneratedChanges.length > 0;
  let versionBumpResult = null;
  // Web template: version bump during promote staging is optional and profile-driven.
  // The DDRE Intranet review-version-bump logic is removed. Add back if your project needs it.

  const preflightSourceStatus = getWorkingTreeStatus();
  const sourceHasLocalChanges = preflightSourceStatus.length > 0;
  const sourceHasOnlyGeneratedReviewPromotionChanges = false; // Web template: no generated promotion metadata

  if (sourceHasLocalChanges && !target.allowDirtySourceSync) {
    fail(`Promotion target '${key}' requires a clean '${sourceBranch}' branch before promotion.`);
  }

  const reportBranches = getStatusReportBranches(config, [sourceBranch, targetBranch]);
  const preTriggerSnapshot = captureBranchSnapshots(repoRoot, reportBranches);

  runVerificationGates(config, cliOptions.dryRun, "Source verification gate");
  runBuildGate(config, cliOptions.dryRun, "Source runtime build");

  if (target.stopIfVerificationOrBuildChangesWorkingTree !== false && !cliOptions.dryRun) {
    const postGateSourceStatus = getWorkingTreeStatus();

    if (postGateSourceStatus !== preflightSourceStatus) {
      fail(
        "Promotion stopped because the source verification/build steps changed the working tree. Inspect those changes before attempting a source sync."
      );
    }
  } else if (target.stopIfVerificationOrBuildChangesWorkingTree !== false) {
    console.log("[dry-run] Would stop if source verification/build changed the working tree before source sync.");
  }

  if (sourceHasLocalChanges) {
    if (!cliOptions.allowDirtySourceSync && !sourceHasOnlyGeneratedReviewPromotionChanges) {
      fail(
        "Promotion stopped because the source branch is dirty. Review the pending changes, create a checkpoint if needed, then rerun with --allow-dirty-source-sync to publish them intentionally."
      );
    }

    if (sourceHasOnlyGeneratedReviewPromotionChanges && !cliOptions.allowDirtySourceSync) {
      console.log("Source sync contains only generated review promotion metadata; committing it automatically.");
    }

    printDirtySyncSummary(preflightSourceStatus, "source promotion sync");

    if (cliOptions.checkpointBeforeDirtySourceSync) {
      createLocalCheckpointSnapshot(config, `promote-${key}`, cliOptions.dryRun);
    }

    runMutableGit(["add", "-A"], cliOptions.dryRun, `Stage the ${sourceBranch} source sync commit`);
    runMutableGit(
      ["commit", "-m", cliOptions.sourceCommitMessage || target.defaultSourceSyncCommitMessage || `chore(promote): sync ${sourceBranch} before ${key} promotion`],
      cliOptions.dryRun,
      `Create the ${sourceBranch} source sync commit`
    );
  } else if (cliOptions.checkpointBeforeDirtySourceSync) {
    console.log("No dirty source changes were present, so no checkpoint snapshot was created.");
  }

  sourceRemoteExists = gitRemoteBranchExists(sourceBranch);
  sourceRemoteState = inspectBranchSyncState(sourceBranch, sourceRemoteExists, true);
  stopIfBehindOrDiverged(sourceRemoteState, `origin/${sourceBranch}`);

  publishBranchIfNeeded({
    branchName: sourceBranch,
    remoteExists: sourceRemoteExists,
    remoteState: sourceRemoteState,
    dryRun: cliOptions.dryRun,
    allowFirstPublish: target.allowFirstSourcePublish,
    publishEnabled: target.publishSourceWhenNeeded,
    purposeLabel: `Publish ${sourceBranch} before promotion`
  });

  prepareTargetBranch(target, cliOptions.dryRun);

  const safetyTag = createSafetySnapshotTag(config, targetBranch, cliOptions.dryRun);
  const preMergeTargetCommit = cliOptions.dryRun ? `refs/heads/${targetBranch}` : getHeadCommit();

  runMutableGit(
    ["merge", "--no-ff", sourceBranch, "-m", cliOptions.mergeMessage || target.defaultMergeCommitMessage || `chore(${targetBranch}): promote ${sourceBranch} to ${targetBranch}`],
    cliOptions.dryRun,
    `Merge ${sourceBranch} into ${targetBranch}`
  );

  runMergeDeletionAudit(config, preMergeTargetCommit, cliOptions.dryRun, cliOptions.confirmDeletions);

  const targetPreGateStatus = cliOptions.dryRun ? "" : getWorkingTreeStatus();

  runVerificationGates(config, cliOptions.dryRun, "Merged target verification gate");
  runBuildGate(config, cliOptions.dryRun, "Merged target runtime build");

  if (target.stopIfVerificationOrBuildChangesWorkingTree !== false && !cliOptions.dryRun) {
    const postGateTargetStatus = getWorkingTreeStatus();

    if (postGateTargetStatus !== targetPreGateStatus) {
      fail(
        "Promotion stopped because the merged target verification/build steps changed the working tree. Inspect those changes before publication or SHIP."
      );
    }
  } else if (target.stopIfVerificationOrBuildChangesWorkingTree !== false) {
    console.log("[dry-run] Would stop if merged target verification/build changed the working tree before publication or SHIP.");
  }

  const targetRemoteExists = gitRemoteBranchExists(targetBranch);
  const targetRemoteState = inspectBranchSyncState(targetBranch, targetRemoteExists, false, cliOptions.dryRun);

  if (target.publishTargetAfterPromotion) {
    stopIfBehindOrDiverged(targetRemoteState, `origin/${targetBranch}`);

    publishBranchIfNeeded({
      branchName: targetBranch,
      remoteExists: targetRemoteExists,
      remoteState: targetRemoteState,
      dryRun: cliOptions.dryRun,
      allowFirstPublish: target.allowFirstTargetPublish,
      publishEnabled: true,
      purposeLabel: `Publish ${targetBranch} after promotion`
    });

    console.log(`The promoted ${targetBranch} candidate is now the branch-backed review publication target.`);
  } else {
    console.log("No push to origin/main will be performed as part of this promotion. Run SHIP next if the promoted main candidate is approved.");
  }

  console.log(`Safety snapshot tag: ${safetyTag}`);
  console.log("Post-promotion validation:");
  for (const item of target.postPromotionValidation) {
    console.log(`- ${item}`);
  }

  runVersionStatusCheck({
    dryRun: cliOptions.dryRun,
    strict: false,
    workflowLabel: `promote ${key}`,
  });

  if (target.returnToSourceBranchAfterPromotion && !cliOptions.stayOnTarget) {
    runMutableGit(["switch", sourceBranch], cliOptions.dryRun, `Return to ${sourceBranch}`);
  }

  printPostTriggerStatusReport({
    repoRoot,
    title: cliOptions.dryRun ? "Post-promotion dry-run status report" : "Post-promotion status report",
    outcome: cliOptions.dryRun ? `Dry run only; no refs were changed for promote ${key}.` : `Promote ${key} completed successfully.`,
    currentBranch: getCurrentBranch(),
    branchNames: reportBranches,
    beforeSnapshot: preTriggerSnapshot,
    branchActions: getPromotionStatusActions(config, key),
    extraItems: [
      {
        label: cliOptions.dryRun ? "Planned safety tag" : "Safety tag",
        value: safetyTag
      }
    ],
    nextSteps: getPromotionNextSteps(key)
  });
}

function bumpReviewVersionSource(_config, _dryRun) {
  // Web template: version bump during promote is not performed by default.
  // Override this function in project-specific runners if needed.
  return null;
}

function loadPolicy() {
  try {
    return JSON.parse(fs.readFileSync(policyPath, "utf8"));
  } catch (error) {
    fail(`Could not read ${policyPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveTarget(targets, targetArg) {
  const normalized = String(targetArg).toLowerCase();

  for (const [key, target] of Object.entries(targets)) {
    const names = [key, ...(target.aliases || [])].map((value) => String(value).toLowerCase());

    if (names.includes(normalized)) {
      return { key, target };
    }
  }

  return null;
}

function runVerificationGates(config, dryRun, descriptionPrefix) {
  const commands = config.profile && config.profile.commands ? config.profile.commands : {};
  const configuredBlockingCommands =
    config.profile && config.profile.verification && Array.isArray(config.profile.verification.blockingCommands)
      ? config.profile.verification.blockingCommands
      : ["format", "test", "lint"];
  const labelMap = {
    format: "Format",
    test: "Test",
    lint: "Lint",
    build: "Build",
    "release-build": "Release build"
  };
  const verificationCommands = configuredBlockingCommands
    .map((gateName) => [labelMap[gateName] || gateName, commands[gateName]])
    .filter(([, command]) => typeof command === "string" && command.trim().length > 0);

  if (verificationCommands.length === 0) {
    fail("No verification commands are configured in .github/TCTBP.json.");
  }

  for (const [label, command] of verificationCommands) {
    runShellCommand(command, dryRun, `${descriptionPrefix}: ${label}`);
  }
}

function runBuildGate(config, dryRun, description) {
  const buildCommand = config.deploy && typeof config.deploy.buildCommand === "string" ? config.deploy.buildCommand : null;

  if (!buildCommand) {
    fail("No deploy build command is configured in .github/TCTBP.json.");
  }

  runShellCommand(buildCommand, dryRun, description);
}

function runVersionStatusCheck({ dryRun, strict, workflowLabel }) {
  const scriptPath = resolveRepoPath("scripts/version-status.mjs");
  const args = [scriptPath];

  if (strict) {
    args.push("--strict");
  }

  if (dryRun) {
    console.log(`[dry-run] Version safety check after ${workflowLabel}: node ${args.join(" ")}`);
    return;
  }

  const result = spawnSync("node", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    if (strict) {
      fail(`Version safety check failed after ${workflowLabel}: ${result.error.message}`);
    }

    console.log(`Version safety check warning after ${workflowLabel}: ${result.error.message}`);
    return;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    if (strict) {
      fail(`Version safety check failed after ${workflowLabel} with exit code ${result.status}.`);
    }

    console.log(`Version safety check warning after ${workflowLabel}: exit code ${result.status}.`);
  }
}

function getCurrentBranch() {
  return runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"], "Determine the current branch");
}

function getHeadCommit() {
  return runGitCapture(["rev-parse", "HEAD"], "Resolve HEAD commit");
}

function gitLocalBranchExists(branchName) {
  const result = spawnSync("git", ["show-ref", "--verify", `refs/heads/${branchName}`], {
    cwd: repoRoot,
    stdio: "ignore"
  });

  return result.status === 0;
}

function gitRemoteBranchExists(branchName) {
  const result = spawnSync("git", ["show-ref", "--verify", `refs/remotes/origin/${branchName}`], {
    cwd: repoRoot,
    stdio: "ignore"
  });

  return result.status === 0;
}

function inspectBranchSyncState(branchName, remoteExists, currentBranchState = false, dryRun = false) {
  if (!remoteExists) {
    return {
      ahead: 0,
      behind: 0,
      diverged: false
    };
  }

  const localRef = currentBranchState ? "HEAD" : `refs/heads/${branchName}`;
  const output = runGitCapture(
    ["rev-list", "--left-right", "--count", `${localRef}...refs/remotes/origin/${branchName}`],
    `Inspect sync state for ${branchName}`,
    dryRun
  );
  const parts = output.split(/\s+/).map((value) => Number.parseInt(value, 10));

  if (parts.length !== 2 || parts.some((value) => Number.isNaN(value))) {
    fail(`Could not parse branch sync state output for ${branchName}: '${output}'.`);
  }

  return {
    ahead: parts[0],
    behind: parts[1],
    diverged: parts[0] > 0 && parts[1] > 0
  };
}

function stopIfBehindOrDiverged(remoteState, remoteBranchLabel) {
  if (remoteState.diverged) {
    fail(`Promotion stopped because the local branch has diverged from ${remoteBranchLabel}.`);
  }

  if (remoteState.behind > 0) {
    fail(`Promotion stopped because the local branch is behind ${remoteBranchLabel} by ${remoteState.behind} commit(s).`);
  }
}

function publishBranchIfNeeded({ branchName, remoteExists, remoteState, dryRun, allowFirstPublish, publishEnabled, purposeLabel }) {
  if (!publishEnabled) {
    if (!remoteExists || remoteState.ahead > 0) {
      fail(`Promotion policy does not allow publishing ${branchName} as part of this workflow.`);
    }

    return;
  }

  if (!remoteExists) {
    if (!allowFirstPublish) {
      fail(`Promotion policy does not allow first publication of ${branchName}.`);
    }

    runMutableGit(["push", "-u", "origin", branchName], dryRun, purposeLabel);
    return;
  }

  if (remoteState.ahead > 0) {
    runMutableGit(["push", "origin", branchName], dryRun, purposeLabel);
    return;
  }

  console.log(`${branchName} is already up to date on origin; no publication push is needed.`);
}

function prepareTargetBranch(target, dryRun) {
  const targetBranch = target.targetBranch;
  const localTargetExists = gitLocalBranchExists(targetBranch);
  const remoteTargetExists = gitRemoteBranchExists(targetBranch);

  if (!localTargetExists && !remoteTargetExists) {
    fail(`Promotion target branch '${targetBranch}' does not exist locally or on origin.`);
  }

  if (!localTargetExists) {
    runMutableGit(["switch", "-c", targetBranch, "--track", `origin/${targetBranch}`], dryRun, `Create local ${targetBranch} branch from origin/${targetBranch}`);
  } else {
    const targetRemoteState = inspectBranchSyncState(targetBranch, remoteTargetExists, false, dryRun);

    if (targetRemoteState.diverged) {
      fail(`Promotion stopped because ${targetBranch} has diverged from origin/${targetBranch}.`);
    }

    if (targetRemoteState.ahead > 0) {
      fail(`Promotion stopped because local ${targetBranch} has unpublished commits ahead of origin/${targetBranch}.`);
    }

    runMutableGit(["switch", targetBranch], dryRun, `Switch to ${targetBranch}`);

    if (remoteTargetExists && targetRemoteState.behind > 0) {
      if (!target.allowTargetFastForwardFromOrigin) {
        fail(`Promotion stopped because local ${targetBranch} is behind origin/${targetBranch}.`);
      }

      runMutableGit(["merge", "--ff-only", `origin/${targetBranch}`], dryRun, `Fast-forward ${targetBranch} from origin/${targetBranch}`);
    }
  }

  if (target.requireCleanTargetBeforeMerge) {
    if (!dryRun) {
      const targetStatus = getWorkingTreeStatus();

      if (targetStatus.length > 0) {
        fail(`Promotion stopped because target branch '${targetBranch}' is not clean before merge.`);
      }
    } else {
      console.log(`[dry-run] Would require target branch '${targetBranch}' to be clean before merge.`);
    }
  }
}

function createSafetySnapshotTag(config, branchName, dryRun) {
  const safetyPrefix =
    config.codeLossPrevention && typeof config.codeLossPrevention.safetyTagPrefix === "string"
      ? config.codeLossPrevention.safetyTagPrefix
      : "safety/";
  const tagName = `${safetyPrefix}promote-${sanitizeBranchName(branchName)}-${createTimestamp()}`;

  runMutableGit(["tag", tagName], dryRun, `Create local safety snapshot tag ${tagName}`);

  return tagName;
}

function runMergeDeletionAudit(config, preMergeTargetCommit, dryRun, confirmDeletions) {
  const rules =
    config.codeLossPrevention && config.codeLossPrevention.mergeDeleteAudit
      ? config.codeLossPrevention.mergeDeleteAudit
      : {
          warnThresholdFiles: 5,
          warnThresholdLines: 500,
          hardStopThresholdFiles: 20,
          hardStopThresholdLines: 2000
        };

  if (dryRun) {
    console.log(
      `[dry-run] Would run merge deletion audit after merge using thresholds warn>${rules.warnThresholdFiles} files/${rules.warnThresholdLines} lines and hard>${rules.hardStopThresholdFiles} files/${rules.hardStopThresholdLines} lines.`
    );
    return;
  }

  const deletedFilesOutput = runGitCapture(["diff", "--name-only", "--diff-filter=D", `${preMergeTargetCommit}..HEAD`], "Inspect deleted files after promotion merge", true);
  const deletedFiles = deletedFilesOutput
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const numstatOutput = runGitCapture(["diff", "--numstat", `${preMergeTargetCommit}..HEAD`], "Inspect merge diff statistics", true);
  const removedLines = sumRemovedLines(numstatOutput);
  const deletedCount = deletedFiles.length;

  if (deletedCount === 0 && removedLines === 0) {
    return;
  }

  if (deletedCount > 0) {
    console.log(`Merge deletion audit: ${deletedCount} deleted file(s), ${removedLines} removed line(s).`);
    for (const filePath of deletedFiles) {
      console.log(`- ${filePath}`);
    }
  } else {
    console.log(`Merge deletion audit: 0 deleted files, ${removedLines} removed line(s).`);
  }

  const exceedsWarn = deletedCount > rules.warnThresholdFiles || removedLines > rules.warnThresholdLines;
  const exceedsHard = deletedCount > rules.hardStopThresholdFiles || removedLines > rules.hardStopThresholdLines;

  if (!exceedsWarn) {
    return;
  }

  if (!confirmDeletions) {
    const severity = exceedsHard ? "HARD STOP" : "STOP";
    fail(
      `${severity}: this promotion deletes ${deletedCount} file(s) and removes ${removedLines} line(s). Review the list above and rerun with --confirm-deletions if it is intentional.`
    );
  }

  if (exceedsHard) {
    console.log("Proceeding past the hard deletion threshold because --confirm-deletions was provided.");
  } else {
    console.log("Proceeding past the deletion warning threshold because --confirm-deletions was provided.");
  }
}

function sumRemovedLines(numstatOutput) {
  return numstatOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .reduce((total, line) => {
      const parts = line.split(/\s+/);
      const removed = Number.parseInt(parts[1], 10);
      return total + (Number.isNaN(removed) ? 0 : removed);
    }, 0);
}

function getWorkingTreeStatus() {
  return runGitCapture(["status", "--porcelain", "--untracked-files=all"], "Inspect working tree state", true);
}

function printDirtySyncSummary(statusOutput, contextLabel) {
  const lines = statusOutput
    .split(/\r?\n/)
    .map((value) => value.trimEnd())
    .filter((value) => value.length > 0);

  if (lines.length === 0) {
    return;
  }

  const counts = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0,
    other: 0
  };

  for (const line of lines) {
    counts[classifyStatusLine(line)] += 1;
  }

  const summaryParts = [
    ["modified", counts.modified],
    ["added", counts.added],
    ["deleted", counts.deleted],
    ["renamed", counts.renamed],
    ["copied", counts.copied],
    ["untracked", counts.untracked],
    ["other", counts.other]
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`);

  console.log(`Dirty sync summary for ${contextLabel} (${lines.length} file(s)): ${summaryParts.join(", ")}`);
  console.log("These paths will be staged into the source sync commit:");

  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function getReviewPromotionGeneratedPaths(_config) {
  // Web template: no review promotion generated paths.
  return new Set();
}

function statusOnlyTouchesAllowedPaths(statusOutput, allowedPaths) {
  const lines = statusOutput
    .split(/\r?\n/)
    .map((value) => value.trimEnd())
    .filter((value) => value.length > 0);

  return lines.length > 0 && lines.every((line) => allowedPaths.has(extractStatusPath(line)));
}

function extractStatusPath(line) {
  const rawPath = line.length > 2 ? line.slice(2).trim() : "";
  const renameSeparator = " -> ";
  const pathValue = rawPath.includes(renameSeparator)
    ? rawPath.slice(rawPath.lastIndexOf(renameSeparator) + renameSeparator.length)
    : rawPath;

  return normaliseRepoRelativePath(pathValue);
}

function normaliseRepoRelativePath(value) {
  return String(value).trim().replace(/^"|"$/g, "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function classifyStatusLine(line) {
  const code = line.slice(0, 2);

  if (code === "??") {
    return "untracked";
  }

  const significantCode = code.replace(/\s/g, "");

  if (significantCode.includes("R")) {
    return "renamed";
  }

  if (significantCode.includes("C")) {
    return "copied";
  }

  if (significantCode.includes("D")) {
    return "deleted";
  }

  if (significantCode.includes("A")) {
    return "added";
  }

  if (significantCode.includes("M")) {
    return "modified";
  }

  return "other";
}

function createLocalCheckpointSnapshot(config, targetKey, dryRun) {
  const checkpointConfig = config.checkpoint || {};
  const checkpointBranch = `checkpoint/${targetKey}-${createTimestamp()}`;
  const checkpointMessage =
    typeof checkpointConfig.defaultCommitMessage === "string" && checkpointConfig.defaultCommitMessage.trim().length > 0
      ? `${checkpointConfig.defaultCommitMessage} before ${targetKey}`
      : `checkpoint: preserve local working state before ${targetKey}`;

  if (dryRun) {
    console.log(`[dry-run] Create local checkpoint branch '${checkpointBranch}' with message '${checkpointMessage}'.`);
    return;
  }

  runMutableGit(["add", "-A"], false, "Stage the local checkpoint snapshot");

  const checkpointTree = runGitCapture(["write-tree"], "Write checkpoint snapshot tree");
  const checkpointParent = runGitCapture(["rev-parse", "HEAD"], "Resolve checkpoint snapshot parent");
  const checkpointCommit = runGitCapture(
    ["commit-tree", checkpointTree, "-p", checkpointParent, "-m", checkpointMessage],
    "Create checkpoint snapshot commit"
  );

  runMutableGit(["branch", checkpointBranch, checkpointCommit], false, `Create local checkpoint branch ${checkpointBranch}`);
  console.log(`Created local checkpoint branch '${checkpointBranch}' at ${checkpointCommit}.`);
}

function runMutableGit(args, dryRun, description) {
  if (dryRun) {
    console.log(`[dry-run] ${description}: git ${args.join(" ")}`);
    return;
  }

  const result = spawnSync("git", args, {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.error) {
    fail(`${description} failed: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    fail(`${description} failed with exit code ${result.status}.`);
  }
}

function runGitCapture(args, description, allowEmpty = false) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    fail(`${description} failed: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    fail(`${description} failed${stderr ? `: ${stderr}` : "."}`);
  }

  const stdout = (result.stdout || "").trim();

  if (!allowEmpty && !stdout) {
    fail(`${description} returned no output.`);
  }

  return stdout;
}

function runShellCommand(command, dryRun, description) {
  if (dryRun) {
    console.log(`[dry-run] ${description}: ${command}`);
    return;
  }

  const result = spawnSync(command, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true
  });

  if (result.error) {
    fail(`${description} failed: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    fail(`${description} failed with exit code ${result.status}.`);
  }
}

function parseArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    list: false,
    allowDirtySourceSync: false,
    checkpointBeforeDirtySourceSync: false,
    confirmDeletions: false,
    stayOnTarget: false,
    docsNoteKind: null,
    docsNote: null,
    releaseNotesOverrideReason: null,
    sourceCommitMessage: null,
    mergeMessage: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--list":
        parsed.list = true;
        break;
      case "--allow-dirty-source-sync":
        parsed.allowDirtySourceSync = true;
        break;
      case "--checkpoint-before-dirty-source-sync":
        parsed.checkpointBeforeDirtySourceSync = true;
        break;
      case "--confirm-deletions":
        parsed.confirmDeletions = true;
        break;
      case "--stay-on-target":
        parsed.stayOnTarget = true;
        break;
      case "--docs-updated":
      case "--no-docs-impact": {
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
          fail(`${arg} requires a quoted reason.`);
        }

        if (parsed.docsNoteKind) {
          fail("Provide only one docs-impact flag.");
        }

        parsed.docsNoteKind = arg === "--docs-updated" ? "docs-updated" : "no-docs-impact";
        parsed.docsNote = value;
        index += 1;
        break;
      }
      case "--release-notes-override": {
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
          fail("--release-notes-override requires a quoted reason.");
        }

        parsed.releaseNotesOverrideReason = value;
        index += 1;
        break;
      }
      case "--source-commit-message": {
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
          fail("--source-commit-message requires a quoted commit message.");
        }

        parsed.sourceCommitMessage = value;
        index += 1;
        break;
      }
      case "--merge-message": {
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
          fail("--merge-message requires a quoted merge message.");
        }

        parsed.mergeMessage = value;
        index += 1;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          fail(`Unknown option '${arg}'.`);
        }

        if (parsed.target) {
          fail(`Unexpected extra argument '${arg}'.`);
        }

        parsed.target = arg;
        break;
    }
  }

  return parsed;
}

function printUsage(exitCode, config = null) {
  const targetList = config ? Object.keys(config.promote.targets).join("|") : "staging|production";
  console.log(
    "Usage: node scripts/tctbp-run-promote.js <" +
      targetList +
      "> [--dry-run] [--docs-updated \"<reason>\" | --no-docs-impact \"<reason>\"] [--release-notes-override \"<reason>\"] [--allow-dirty-source-sync] [--checkpoint-before-dirty-source-sync] [--confirm-deletions] [--source-commit-message \"<message>\"] [--merge-message \"<message>\"] [--stay-on-target] [--list]"
  );

  if (config) {
    console.log("Configured promotion targets:");
    for (const [key, target] of Object.entries(config.promote.targets)) {
      const aliases = target.aliases && target.aliases.length > 0 ? ` (aliases: ${target.aliases.join(", ")})` : "";
      console.log(`- ${key}: ${target.sourceBranch} -> ${target.targetBranch}${aliases}`);
    }
  }

  process.exit(exitCode);
}

function getStatusReportBranches(config, extraBranches) {
  const branchModel = config.branchModel || {};

  return [
    branchModel.workingBranch,
    branchModel.reviewBranch,
    branchModel.productionBranch || (config.project ? config.project.defaultBranch : null),
    ...(extraBranches || [])
  ].filter((value, index, array) => typeof value === "string" && value.trim().length > 0 && array.indexOf(value) === index);
}

function getPromotionStatusActions(config, targetKey) {
  const branchModel = config.branchModel || {};
  const workingBranch = branchModel.workingBranch || "development";
  const reviewBranch = branchModel.reviewBranch || "staging";
  const productionBranch = branchModel.productionBranch || (config.project ? config.project.defaultBranch : "main");
  const actions = {};

  if (targetKey === "staging") {
    actions[workingBranch] = "Continue day-to-day work on development.";
    actions[reviewBranch] = "Promoted candidate is published; deploy review or collect field feedback.";
    actions[productionBranch] = "No change to production.";
    return actions;
  }

  actions[workingBranch] = "No change to the working branch.";
  actions[reviewBranch] = "Approved source candidate remains published on review.";
  actions[productionBranch] = "Local production candidate is ready; run ship when approved.";

  return actions;
}

function getPromotionNextSteps(targetKey) {
  if (targetKey === "staging") {
    return [
      "Run deploy review when you want the review local platform target to pick up origin/review.",
      "Continue development work from the development branch."
    ];
  }

  return [
    "Run ship from local main when the promoted production candidate is approved.",
    "Do not push main directly outside the ship workflow."
  ];
}

function sanitizeBranchName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function createTimestamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function logSection(title) {
  console.log(title);
  console.log("=".repeat(title.length));
}

function logItem(label, value) {
  console.log(`${label}: ${value}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validateReleaseNotesEntry(_opts) {
  // Web template: release notes validation is not performed by default.
  // Override this function in project-specific runners if needed.
  return { ok: true, reason: "release notes validation skipped (web template)" };
}

function extractReleaseItemBlocks(itemsBlockContent) {
  return [...String(itemsBlockContent || "").matchAll(/\{[\s\S]*?\n\s*\},?/g)]
    .map((match) => String(match[0] || ""))
    .filter((value) => value.length > 0);
}

function extractPatchBlockForVersion(content, version) {
  const escapedVersion = escapeRegExp(version);
  const versionRegex = new RegExp(`version:\\s*["']${escapedVersion}["']`);
  const versionMatch = versionRegex.exec(content);

  if (!versionMatch) {
    return null;
  }

  const start = content.lastIndexOf("{", versionMatch.index);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

function isPlaceholderText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  return /(placeholder|tbd|to\s*do|todo|example|coming soon|fixme|n\/a)/i.test(text);
}

function hasTicketReference(value) {
  return /\b[A-Z][A-Z0-9]{0,9}-\d{3,}\b/.test(String(value || "").toUpperCase());
}

function hasCommitReference(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }

  if (/\/[Cc][Oo][Mm][Mm][Ii][Tt]\/[a-f0-9]{7,40}\b/.test(text)) {
    return true;
  }

  if (/\b(?:commit|sha)\s*[:#-]?\s*[a-f0-9]{7,40}\b/i.test(text)) {
    return true;
  }

  return /\b[a-f0-9]{7,40}\b/i.test(text);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
