#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { captureBranchSnapshots, printPostTriggerStatusReport } = require("./tctbp-status-report");
const { resolvePolicyPath, resolveRepoRoot } = require("./tctbp-runtime");
const {
  createTimestamp,
  fail,
  getCurrentBranch,
  getHeadCommit,
  getReleaseTagPattern,
  getTagsPointingAtHead,
  getWorkingTreeStatus,
  gitLocalBranchExists,
  gitRemoteBranchExists,
  gitRemoteTagExists,
  gitRefExists,
  inspectBranchSyncState,
  loadPolicy,
  logItem,
  logSection,
  printDirtySummary,
  printSummaryTable,
  readVersionSource,
  resolveRepoPath,
  resolveTarget,
  runBuildGate,
  runGitCapture,
  runShellCommand,
  runVerificationGates,
  stepSemVer,
  stopIfBehindOrDiverged,
  summariseWorkingTree,
} = require("./tctbp-core");

const repoRoot = resolveRepoRoot();
const policyPath = resolvePolicyPath(repoRoot);

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

if (!options.target) {
  console.error("Missing deploy target.");
  printUsage(1);
}

if (!options.docsNoteKind || !options.docsNote) {
  console.error("Exactly one docs-impact note is required. Use --docs-updated \"<reason>\" or --no-docs-impact \"<reason>\".");
  printUsage(1);
}

const policy = loadPolicy();
const resolvedTarget = resolveTarget(policy.deploy.targets, options.target);

if (!resolvedTarget) {
  console.error(`Unknown deploy target '${options.target}'.`);
  printUsage(1, policy);
}

main(policy, resolvedTarget, options);

function main(config, targetInfo, cliOptions) {
  const { key, target } = targetInfo;
  const expectedBranch = target.expectedBranch;
  const branch = getCurrentBranch();

  if (branch === "HEAD") {
    fail("Deploy stopped because HEAD is detached.");
  }

  if (branch !== expectedBranch) {
    fail(`Deploy target '${key}' requires branch '${expectedBranch}', but the current branch is '${branch}'.`);
  }

  const preflightStatus = getWorkingTreeStatus();
  const hasLocalChanges = preflightStatus.length > 0;

  if (hasLocalChanges && target.requireCleanTreeBeforeDeployAction) {
    fail(`Deploy target '${key}' requires a clean working tree before deployment.`);
  }

  logSection(`Deploy ${key}`);
  logItem("Branch", branch);
  logItem("Docs impact", `${cliOptions.docsNoteKind === "docs-updated" ? "Docs updated" : "No docs impact"}: ${cliOptions.docsNote}`);
  logItem("Mode", cliOptions.dryRun ? "dry-run" : "live");

  // Storage guards removed for web template — add project-specific guards in TCTBP.json if needed.

  const remoteRef = `refs/remotes/origin/${expectedBranch}`;
  const remoteBranchLabel = `origin/${expectedBranch}`;

  runMutableGit(["fetch", "--prune", "origin"], cliOptions.dryRun, "Fetch origin before deploy preflight");

  let remoteExists = gitRefExists(remoteRef);
  const remoteState = inspectBranchSyncState(expectedBranch, { remoteExists, localRef: "HEAD" });

  stopIfBehindOrDiverged(remoteState, remoteBranchLabel, "Deploy");
  stopIfUnpublishedOrAhead(target, key, remoteExists, remoteState, remoteBranchLabel);

  if (key === "production") {
    const shippedTags = getTagsPointingAtHead(config);

    if (shippedTags.length === 0) {
      fail("Deploy stopped because main HEAD is not tagged with a shipped release tag.");
    }

    const publishedShippedTag = findPublishedReleaseTag(shippedTags);

    if (!publishedShippedTag) {
      fail("Deploy stopped because the shipped release tag on HEAD is not published to origin.");
    }

    logItem("Release tag", publishedShippedTag);
  }

  const reportBranches = getStatusReportBranches(config, [expectedBranch]);
  const preTriggerSnapshot = captureBranchSnapshots(repoRoot, reportBranches);

  runVerificationGates(config, cliOptions.dryRun);
  runBuildGate(config, cliOptions.dryRun);

  if (target.stopIfVerificationOrBuildChangesWorkingTree !== false && !cliOptions.dryRun) {
    const postGateStatus = getWorkingTreeStatus();

    if (postGateStatus !== preflightStatus) {
      fail(
        "Deploy stopped because the verification/build steps changed the working tree. Inspect those changes before attempting a deploy sync."
      );
    }
  } else if (target.stopIfVerificationOrBuildChangesWorkingTree !== false) {
    console.log("[dry-run] Would stop if verification/build changed the working tree before sync.");
  }

  if (hasLocalChanges) {
    if (!target.allowCommitBeforeDeploy) {
      fail(`Deploy target '${key}' does not allow a pre-deploy sync commit.`);
    }

    if (!cliOptions.allowDirtySync) {
      fail(
        "Deploy stopped because the working tree is dirty. Review the pending changes, create a checkpoint if needed, then rerun with --allow-dirty-sync to publish them intentionally."
      );
    }

    printDirtySummary(preflightStatus, "Deploy sync summary", "These paths will be staged into the deploy sync commit:");

    if (cliOptions.checkpointBeforeDirtySync) {
      createLocalCheckpointSnapshot(config, key, cliOptions.dryRun);
    }

    runMutableGit(["add", "-A"], cliOptions.dryRun, "Stage the deploy sync commit");
    runMutableGit(
      ["commit", "-m", cliOptions.commitMessage || target.defaultPreDeployCommitMessage],
      cliOptions.dryRun,
      "Create the deploy sync commit"
    );
  } else if (cliOptions.checkpointBeforeDirtySync) {
    console.log("No dirty working tree changes were present, so no checkpoint snapshot was created.");
  }

  remoteExists = gitRefExists(remoteRef);
  remoteState = inspectBranchSyncState(expectedBranch, { remoteExists, localRef: "HEAD" });
  stopIfBehindOrDiverged(remoteState, remoteBranchLabel, "Deploy");
  stopIfUnpublishedOrAhead(target, key, remoteExists, remoteState, remoteBranchLabel);

  if (!remoteExists) {
    if (!target.allowFirstPublishBeforeDeploy) {
      fail(`Deploy target '${key}' does not allow first publication to ${remoteBranchLabel}.`);
    }

    runMutableGit(["push", "-u", "origin", expectedBranch], cliOptions.dryRun, `Publish ${expectedBranch} to ${remoteBranchLabel}`);
  } else if (remoteState.ahead > 0) {
    if (!target.allowPushBeforeDeploy) {
      fail(`Deploy target '${key}' does not allow publishing local commits before deployment.`);
    }

    runMutableGit(["push", "origin", expectedBranch], cliOptions.dryRun, `Push ${expectedBranch} to ${remoteBranchLabel}`);
  } else {
    console.log(`${remoteBranchLabel} is already up to date; no deploy sync push is needed.`);
  }

  runRuntimePublishStep(config, key, expectedBranch, cliOptions.dryRun);

  logDeployMechanismMessage(key);

  console.log("Post-deploy validation:");
  for (const item of target.postDeployValidation || []) {
    console.log(`- ${item}`);
  }

  printPostTriggerStatusReport({
    repoRoot,
    title: cliOptions.dryRun ? "Post-deploy dry-run status report" : "Post-deploy status report",
    outcome: cliOptions.dryRun ? `Dry run only; no refs were changed for deploy ${key}.` : `Deploy ${key} completed successfully.`,
    currentBranch: getCurrentBranch(),
    branchNames: reportBranches,
    beforeSnapshot: preTriggerSnapshot,
    branchActions: getDeployStatusActions(config, expectedBranch),
    extraItems: [
      {
        label: "Deploy trigger",
        value:
          key === "production"
            ? "Published shipped main state for the production local platform target"
            : `Branch-backed local ${key} target via origin/${expectedBranch}`
      }
    ],
    nextSteps: getDeployNextSteps(expectedBranch)
  });
}

function runRuntimePublishStep(config, targetKey, expectedBranch, dryRun) {
  const template =
    config.deploy && typeof config.deploy.runtimePublishCommand === "string"
      ? config.deploy.runtimePublishCommand.trim()
      : "";

  if (!template) {
    return;
  }

  const command = template
    .replace(/\{target\}/g, targetKey)
    .replace(/\{branch\}/g, expectedBranch);

  runShellCommand(command, dryRun, `Publish local ${targetKey} runtime bundle`);
}

// All core functions imported above — no local redefinitions needed.
// inspectRemoteState replaced with inspectBranchSyncState from core.
// printDirtySyncSummary replaced with printDirtySummary from core.
// runMutableGit, classifyStatusLine imported from core.

function stopIfUnpublishedOrAhead(target, key, remoteExists, remoteState, remoteBranchLabel) {
  for (const tag of tags) {
    if (gitRemoteTagExists(tag)) {
      return tag;
    }
  }

  return null;
}

function createLocalCheckpointSnapshot(config, targetKey, dryRun) {
  const checkpointConfig = config.checkpoint || {};
  const checkpointBranch = `checkpoint/deploy-${targetKey}-${createTimestamp()}`;
  const checkpointMessage =
    typeof checkpointConfig.defaultCommitMessage === "string" && checkpointConfig.defaultCommitMessage.trim().length > 0
      ? `${checkpointConfig.defaultCommitMessage} before deploy ${targetKey}`
      : `checkpoint: preserve local working state before deploy ${targetKey}`;

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeBranchName(branchName) {
  return String(branchName).replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getStatusReportBranches(config, extraBranches = []) {
  const branches = new Set(extraBranches);
  const defaultBranch = (config.branchModel && config.branchModel.productionBranch) || (config.project && config.project.defaultBranch) || "main";

  branches.add(defaultBranch);

  if (config.branchModel && config.branchModel.strategy === "staged") {
    if (config.branchModel.workingBranch) {
      branches.add(config.branchModel.workingBranch);
    }

    if (config.branchModel.stagingBranch) {
      branches.add(config.branchModel.stagingBranch);
    }
  }

  const currentBranch = getCurrentBranch();
  if (currentBranch !== "HEAD") {
    branches.add(currentBranch);
  }

  return Array.from(branches);
}

function getDeployStatusActions(config, expectedBranch) {
  const actions = {};
  actions[expectedBranch] = "Deployed branch.";

  return actions;
}

function getDeployNextSteps(expectedBranch) {
  return [
    `Check the ${expectedBranch} deploy output above.`,
    `Return to your working branch when ready: git switch ${expectedBranch === "main" ? "development" : expectedBranch}`
  ];
}

function logDeployMechanismMessage(key) {
  console.log(`Deploy target '${key}' completed via the local platform mechanism.`);
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-deploy.js <target> [--dry-run] [--list] [--allow-dirty-sync] [--docs-updated|\"--no-docs-impact\" \"<reason>\"] [--checkpoint-before-dirty-sync] [--commit-message \"<message>\"]");
  process.exit(exitCode);
}

function parseArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    list: false,
    allowDirtySync: false,
    checkpointBeforeDirtySync: false,
    docsNoteKind: null,
    docsNote: null,
    commitMessage: null
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
      case "--allow-dirty-sync":
        parsed.allowDirtySync = true;
        break;
      case "--checkpoint-before-dirty-sync":
        parsed.checkpointBeforeDirtySync = true;
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
      case "--commit-message": {
        const value = argv[index + 1];

        if (!value || value.startsWith("--")) {
          fail("--commit-message requires a quoted commit message.");
        }

        parsed.commitMessage = value;
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
  const targetList = config ? Object.keys(config.deploy.targets).join("|") : "dev|staging|production";
  console.log(
    "Usage: node scripts/tctbp-run-deploy.js <" +
      targetList +
      "> [--dry-run] [--docs-updated \"<reason>\" | --no-docs-impact \"<reason>\"] [--allow-dirty-sync] [--checkpoint-before-dirty-sync] [--commit-message \"<message>\"] [--list]"
  );

  if (config) {
    console.log("Configured targets:");
    for (const [key, target] of Object.entries(config.deploy.targets)) {
      const aliases = target.aliases && target.aliases.length > 0 ? ` (aliases: ${target.aliases.join(", ")})` : "";
      console.log(`- ${key}: branch '${target.expectedBranch}'${aliases}`);
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

function getDeployStatusActions(config, expectedBranch) {
  const branchModel = config.branchModel || {};
  const workingBranch = branchModel.workingBranch || "development";
  const reviewBranch = branchModel.reviewBranch || "staging";
  const productionBranch = branchModel.productionBranch || (config.project ? config.project.defaultBranch : "main");
  const actions = {};

  actions[workingBranch] = expectedBranch === workingBranch ? "Development local platform target can pick up origin/development." : "No change to development.";
  actions[reviewBranch] = expectedBranch === reviewBranch ? "Review candidate is current; confirm the review URL and environment." : "No change to review.";
  actions[productionBranch] =
    expectedBranch === productionBranch
      ? "Published shipped main state is the production deploy source; confirm the live environment."
      : "No change to production.";

  return actions;
}

function getDeployNextSteps(expectedBranch) {
  if (expectedBranch === "development") {
    return ["Confirm the development local platform target has picked up origin/development."];
  }

  if (expectedBranch === "staging") {
    return [
      "Confirm the review URL or endpoint is serving the expected candidate.",
      "Collect review feedback or return to development for the next slice."
    ];
  }

  return ["Confirm the production environment is serving the expected shipped release tag from main."];
}

function logDeployMechanismMessage(targetKey) {
  if (targetKey === "production") {
    console.log(
      "No separate deployment command is configured for this repo; use the production local platform target against the already-published shipped main state."
    );
    return;
  }

  console.log(
    `No separate deployment command is configured for this repo; publishing the branch is the deploy trigger for the local ${targetKey} target.`
  );
}

// logSection, logItem, fail, escapeRegExp — imported from core.
