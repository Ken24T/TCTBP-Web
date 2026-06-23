#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
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
  let remoteState = inspectRemoteState(expectedBranch, remoteExists);

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

    printDirtySyncSummary(preflightStatus);

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
  remoteState = inspectRemoteState(expectedBranch, remoteExists);
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
  emitDeployReleaseNotifications(config, key, cliOptions.dryRun);
  rolloverReviewTicketReleaseTargets(key, cliOptions.dryRun);

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

function emitDeployReleaseNotifications(config, targetKey, dryRun) {
  if (targetKey !== "staging" && targetKey !== "production") {
    return;
  }

  try {
    const releaseVersion = resolveDeployReleaseVersion(config);
    if (!releaseVersion) {
      console.log("Skipping deploy release notifications: no release version could be resolved.");
      return;
    }

    const emitterScriptPath = path.resolve(repoRoot, "local/identity/src/emitDeployNotifications.mjs");
    const emitterArgs = [
      emitterScriptPath,
      "--target",
      targetKey,
      "--release-version",
      releaseVersion
    ];

    if (dryRun) {
      emitterArgs.push("--dry-run");
    }

    if (typeof process.env.DDRE_DEPLOY_NOTIFICATION_SCOPE === "string" && process.env.DDRE_DEPLOY_NOTIFICATION_SCOPE.trim().length > 0) {
      emitterArgs.push("--scope", process.env.DDRE_DEPLOY_NOTIFICATION_SCOPE.trim());
    }

    if (typeof process.env.DDRE_DEPLOY_NOTIFICATION_GROUPS === "string" && process.env.DDRE_DEPLOY_NOTIFICATION_GROUPS.trim().length > 0) {
      emitterArgs.push("--groups", process.env.DDRE_DEPLOY_NOTIFICATION_GROUPS.trim());
    }

    if (typeof process.env.DDRE_DEPLOY_NOTIFICATION_TTL_DAYS === "string" && process.env.DDRE_DEPLOY_NOTIFICATION_TTL_DAYS.trim().length > 0) {
      emitterArgs.push("--ttl-days", process.env.DDRE_DEPLOY_NOTIFICATION_TTL_DAYS.trim());
    }

    if (
      typeof process.env.DDRE_DEPLOY_NOTIFICATION_DEDUPE_HOURS === "string"
      && process.env.DDRE_DEPLOY_NOTIFICATION_DEDUPE_HOURS.trim().length > 0
    ) {
      emitterArgs.push("--dedupe-hours", process.env.DDRE_DEPLOY_NOTIFICATION_DEDUPE_HOURS.trim());
    }

    const result = spawnSync("node", emitterArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.error) {
      throw result.error;
    }

    if (typeof result.status === "number" && result.status !== 0) {
      const stderr = (result.stderr || "").trim();
      throw new Error(stderr || `emitDeployNotifications exited with ${result.status}`);
    }

    const stdout = (result.stdout || "").trim();
    if (!stdout) {
      console.log("Deploy release notification emitter returned no output.");
      return;
    }

    const emission = JSON.parse(stdout);
    console.log(
      `Deploy release notifications: ${emission.createdCount} created, ${emission.skippedCount} skipped for ${targetKey} ${releaseVersion}.`
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`Skipping deploy release notifications due to error: ${reason}`);
  }
}

function rolloverReviewTicketReleaseTargets(targetKey, dryRun) {
  if (targetKey !== "staging") {
    return;
  }

  const releaseVersion = resolveDeployReleaseVersion(policy);
  if (!releaseVersion) {
    console.log("Skipping review ticket rollover: no release version could be resolved.");
    return;
  }

  const ticketsFilePath = resolveTicketsFilePath(process.env);

  if (!ticketsFilePath || !fs.existsSync(ticketsFilePath)) {
    console.log(`Skipping review ticket rollover: no tickets file found for ${releaseVersion}.`);
    return;
  }

  let tickets;
  try {
    tickets = JSON.parse(fs.readFileSync(ticketsFilePath, "utf8"));
  } catch (error) {
    console.log(`Skipping review ticket rollover: could not read ${ticketsFilePath}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (!Array.isArray(tickets) || tickets.length === 0) {
    console.log(`Review ticket rollover: no tickets to update for ${releaseVersion}.`);
    return;
  }

  const unresolvedStatuses = new Set(["open", "in_progress"]);
  let updatedCount = 0;

  const updatedTickets = tickets.map((ticket) => {
    if (!ticket || typeof ticket !== "object") {
      return ticket;
    }

    if (!unresolvedStatuses.has(ticket.status)) {
      return ticket;
    }

    if (!isTicketExpectedReleaseBehind(ticket.expectedRelease, releaseVersion)) {
      return ticket;
    }

    updatedCount += 1;
    return {
      ...ticket,
      expectedRelease: releaseVersion,
      updatedAt: new Date().toISOString(),
    };
  });

  if (updatedCount === 0) {
    console.log(`Review ticket rollover: no unresolved tickets targeted before ${releaseVersion} needed updating.`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would retarget ${updatedCount} unresolved stale ticket(s) to promoted review version ${releaseVersion}.`);
    return;
  }

  fs.mkdirSync(path.dirname(ticketsFilePath), { recursive: true });
  const tempPath = `${ticketsFilePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(updatedTickets, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, ticketsFilePath);
  console.log(`Retargeted ${updatedCount} unresolved stale ticket(s) to promoted review version ${releaseVersion}.`);
}

function isTicketExpectedReleaseBehind(expectedRelease, deployedReleaseVersion) {
  const expected = parseComparableSemVer(expectedRelease);
  const deployed = parseComparableSemVer(deployedReleaseVersion);

  if (!expected || !deployed) {
    return false;
  }

  return compareComparableSemVer(expected, deployed) < 0;
}

function parseComparableSemVer(value) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function compareComparableSemVer(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] < right[key]) {
      return -1;
    }

    if (left[key] > right[key]) {
      return 1;
    }
  }

  return 0;
}

function resolveTicketsFilePath(env) {
  const usersFile = typeof env.DDRE_SESSION_USERS_FILE === "string" ? env.DDRE_SESSION_USERS_FILE.trim() : "";
  if (usersFile) {
    return path.join(path.dirname(path.resolve(usersFile)), "tickets.json");
  }

  const xdgStateHome = typeof env.XDG_STATE_HOME === "string" ? env.XDG_STATE_HOME.trim() : "";
  if (xdgStateHome) {
    return path.join(xdgStateHome, "ddre-intranet-local", "tickets.json");
  }

  const home = typeof env.HOME === "string" ? env.HOME.trim() : "";
  if (home) {
    return path.join(home, ".local", "state", "ddre-intranet-local", "tickets.json");
  }

  return null;
}

function resolveDeployReleaseVersion(config) {
  const configuredPath =
    config && config.profile && config.profile.versioning && typeof config.profile.versioning.sourceOfTruth === "string"
      ? config.profile.versioning.sourceOfTruth
      : null;
  const fallbackPath =
    config && config.project && Array.isArray(config.project.versionFiles) && config.project.versionFiles.length > 0
      ? config.project.versionFiles[0]
      : null;
  const versionFile = configuredPath || fallbackPath;

  if (!versionFile) {
    return null;
  }

  const versionFilePath = path.resolve(repoRoot, versionFile);
  if (!fs.existsSync(versionFilePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(versionFilePath, "utf8"));
    return typeof parsed.version === "string" && parsed.version.trim().length > 0 ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}

// inspectRemoteState kept locally: thin deploy-specific wrapper.
function inspectRemoteState(branch, remoteExists) {
  if (!remoteExists) {
    return {
      ahead: 0,
      behind: 0,
      diverged: false
    };
  }

  const output = runGitCapture(["rev-list", "--left-right", "--count", `HEAD...refs/remotes/origin/${branch}`], "Inspect branch sync state");
  const parts = output.split(/\s+/).map((value) => Number.parseInt(value, 10));

  if (parts.length !== 2 || parts.some((value) => Number.isNaN(value))) {
    fail(`Could not parse branch sync state output: '${output}'.`);
  }

  return {
    ahead: parts[0],
    behind: parts[1],
    diverged: parts[0] > 0 && parts[1] > 0
  };
}

function stopIfUnpublishedOrAhead(target, key, remoteExists, remoteState, remoteBranchLabel) {
  if (target.requireSyncedBranchBeforeDeployAction && !remoteExists) {
    fail(`Deploy target '${key}' requires an existing published branch at ${remoteBranchLabel}.`);
  }

  if (target.requireSyncedBranchBeforeDeployAction && remoteState.ahead > 0) {
    fail(`Deploy target '${key}' requires already-published synced branch state; ${remoteBranchLabel} is missing ${remoteState.ahead} local commit(s).`);
  }
}

// stopIfBehindOrDiverged removed: imported from core with "Deploy" prefix.

// printDirtySyncSummary kept locally: deploy-specific single-param signature.
function printDirtySyncSummary(statusOutput) {
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
    const category = classifyStatusLine(line);
    counts[category] += 1;
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

  console.log(`Dirty sync summary (${lines.length} file(s)): ${summaryParts.join(", ")}`);
  console.log("These paths will be staged into the deploy sync commit:");

  for (const line of lines) {
    console.log(`- ${line}`);
  }
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

// classifyStatusLine kept locally: core doesn't export it directly.
// getReleaseTagsPointingAtHead, getReleaseTagPattern, gitRemoteTagExists,
// createTimestamp, runGitCapture, runShellCommand — imported from core.
// stopIfBehindOrDiverged — imported from core with "Deploy" prefix.

// runMutableGit kept locally: deploy-specific readOnly parameter signature.
function runMutableGit(args, dryRun, description, readOnly = false) {
  if (dryRun && !readOnly) {
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

function findPublishedReleaseTag(tags) {
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
