#!/usr/bin/env node

const {
  detectGitOperationState,
  fail,
  fetchOrigin,
  formatSyncStatus,
  getCurrentBranch,
  getHeadCommit,
  getShortRef,
  getWorkingTreeStatus,
  gitRemoteBranchExists,
  inspectBranchSyncState,
  loadPolicy,
  logItem,
  logSection,
  printSummaryTable,
  runCommand,
  runShellCommand,
  summariseWorkingTree
} = require("./tctbp-core");

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

main(loadPolicy(), options);

function main(config, cliOptions) {
  const branch = getCurrentBranch();

  if (branch === "HEAD") {
    fail("Handover stopped because HEAD is detached.");
  }

  const operationStates = detectGitOperationState();
  if (operationStates.length > 0) {
    fail(`Handover stopped because ${operationStates.join(", ")} is already in progress.`);
  }

  logSection("Handover");
  logItem("Branch", branch);
  logItem("Mode", cliOptions.dryRun ? "dry-run" : "live");

  runRuntimeAdvisory(config, cliOptions.dryRun);

  fetchOrigin(cliOptions.dryRun, true);

  const remoteExistsBefore = gitRemoteBranchExists(branch);
  const syncStateBefore = inspectBranchSyncState(branch, {
    remoteExists: remoteExistsBefore,
    localRef: "HEAD"
  });

  if (syncStateBefore.diverged) {
    fail(`Handover stopped because ${branch} has diverged from origin/${branch}.`);
  }

  if (syncStateBefore.behind > 0) {
    fail(`Handover stopped because ${branch} is behind origin/${branch} by ${syncStateBefore.behind} commit(s).`);
  }

  const preHead = getHeadCommit(true);
  const preWorkingTree = summariseWorkingTree(getWorkingTreeStatus());
  const originBefore = remoteExistsBefore ? getShortRef(`refs/remotes/origin/${branch}`) : null;

  let checkpointCreated = false;
  if (!preWorkingTree.isClean) {
    runCommand(
      "node",
      ["scripts/tctbp-run-checkpoint.js", ...(cliOptions.dryRun ? ["--dry-run"] : [])],
      cliOptions.dryRun,
      "Run checkpoint step during handover"
    );
    checkpointCreated = true;
  } else {
    console.log("Working tree is already clean; checkpoint step skipped.");
  }

  const postCheckpointHead = getHeadCommit(true);

  runCommand(
    "node",
    ["scripts/tctbp-run-publish.js", ...(cliOptions.dryRun ? ["--dry-run"] : [])],
    cliOptions.dryRun,
    "Run publish step during handover"
  );

  const remoteExistsAfter = cliOptions.dryRun ? remoteExistsBefore : gitRemoteBranchExists(branch);
  const syncStateAfter = cliOptions.dryRun
    ? syncStateBefore
    : inspectBranchSyncState(branch, { remoteExists: remoteExistsAfter, localRef: "HEAD" });
  const originAfter = remoteExistsAfter ? getShortRef(`refs/remotes/origin/${branch}`) : null;
  const finalHead = getHeadCommit(true);
  const finalWorkingTree = summariseWorkingTree(getWorkingTreeStatus());

  if (!cliOptions.dryRun && (!remoteExistsAfter || syncStateAfter.ahead > 0 || syncStateAfter.behind > 0 || syncStateAfter.diverged)) {
    fail("Handover stopped because branch sync could not be verified after publication.");
  }

  printSummaryTable([
    {
      origin: originBefore || "n/a",
      local: `${branch} @ ${preHead}`,
      status: "Start state",
      actions: preWorkingTree.isClean ? "Working tree was clean." : "Working tree had local changes."
    },
    {
      origin: "n/a",
      local: checkpointCreated ? `${preHead} -> ${postCheckpointHead}` : "no checkpoint needed",
      status: "Checkpoint step",
      actions: checkpointCreated ? "Local checkpoint created before publication." : "Skipped because working tree was already clean."
    },
    {
      origin: `${originBefore || "n/a"} -> ${originAfter || "n/a"}`,
      local: `${branch} @ ${finalHead}`,
      status: `Upstream sync: ${formatSyncStatus(syncStateAfter, remoteExistsAfter)}`,
      actions: cliOptions.dryRun ? "Dry run only; no remote update occurred." : "Branch publication and sync verification completed."
    },
    {
      origin: "n/a",
      local: finalWorkingTree.summary,
      status: "Final baseline",
      actions: finalWorkingTree.isClean ? "Ready to resume on another machine." : "Resolve local changes before relying on handover baseline."
    }
  ]);

  console.log(`Handover ${cliOptions.dryRun ? "plan" : "workflow"} complete for ${branch} at ${finalHead}.`);
}

function runRuntimeAdvisory(config, dryRun) {
  const advisory = config && config.handover && config.handover.runtimeAdvisory;
  const command = advisory && typeof advisory.executionCommand === "string" ? advisory.executionCommand.trim() : "";

  if (!command) {
    return;
  }

  runShellCommand(command, dryRun, "Run handover runtime advisory");
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    list: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--list") {
      parsed.list = true;
      continue;
    }

    fail(`Unknown option '${arg}'.`);
  }

  return parsed;
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-handover.js [--dry-run] [--list]");
  process.exit(exitCode);
}
