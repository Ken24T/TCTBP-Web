#!/usr/bin/env node

const {
  createTimestamp,
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
  repoRoot,
  runCommand,
  runMutableGit,
  runShellCommand,
  summariseWorkingTree
} = require("./tctbp-core");

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

main(loadPolicy(), options).catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main(config, cliOptions) {
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

  // ── Continuation note ─────────────────────────────────────────────────

  const continuationWritten = await writeContinuationNote(config, cliOptions, branch, finalHead);

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
      actions: finalWorkingTree.isClean
        ? (continuationWritten ? "Ready to resume on another machine. Continuation note saved." : "Ready to resume on another machine.")
        : "Resolve local changes before relying on handover baseline."
    }
  ]);

  console.log(`Handover ${cliOptions.dryRun ? "plan" : "workflow"} complete for ${branch} at ${finalHead}.`);
  if (continuationWritten) {
    console.log(`Continuation note saved. Use "resume" or "orient" when you return to this repo.`);
  }
}

async function writeContinuationNote(config, cliOptions, branch, commit) {
  if (cliOptions.dryRun) {
    console.log("[dry-run] Would prompt for handover notes and write a detailed continuation file.");
    return false;
  }

  if (cliOptions.noContinuation) {
    return false;
  }

  const readline = require("readline");
  const fs = require("fs");
  const path = require("path");
  const { spawnSync } = require("child_process");

  console.log("\n--- Handover Continuation ---");
  console.log("This creates a context file so you can pick up where you left off.");
  console.log("Be generous — the more detail, the easier it is to resume.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  const whatWasDone = await ask("What did you accomplish this session? ");
  const whatsNext = await ask("What's the next thing to work on? ");
  const gotchas = await ask("Any mistakes made or things to watch out for? (press Enter to skip): ");
  rl.close();

  // Gather git context
  const recentLog = runGitCaptureSilent(["log", "--oneline", "--decorate", "-n", "15"], repoRoot);
  const recentFiles = runGitCaptureSilent(["diff", "--stat", "HEAD~5..HEAD"], repoRoot);
  const currentFiles = runGitCaptureSilent(["ls-files", "--others", "--exclude-standard", "--modified"], repoRoot);

  const timestamp = createTimestamp();
  const continuationDir = path.join(repoRoot, ".tctbp", "continuation");
  fs.mkdirSync(continuationDir, { recursive: true });

  const fileName = `${timestamp}-handover.md`;
  const filePath = path.join(continuationDir, fileName);

  const content = [
    "# Handover Continuation",
    "",
    "## Session Summary",
    "",
    `**Date:** ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
    `**Branch:** ${branch}`,
    `**Commit:** ${commit}`,
    "",
    "### What was accomplished",
    "",
    whatWasDone.trim() || "_No summary provided._",
    "",
    "### What to work on next",
    "",
    whatsNext.trim() || "_No next steps provided._",
    "",
    gotchas.trim() ? "### Gotchas / things to watch out for" : "",
    gotchas.trim() ? "" : "",
    gotchas.trim() || "",
    gotchas.trim() ? "" : "",
    "## Git Context",
    "",
    "### Recent commits",
    "",
    "```",
    recentLog || "_Could not retrieve git log._",
    "```",
    "",
    recentFiles.trim() ? "### Recent file changes" : "",
    recentFiles.trim() ? "" : "",
    recentFiles.trim() ? "```" : "",
    recentFiles.trim() || "",
    recentFiles.trim() ? "```" : "",
    "",
    currentFiles.trim() ? "### Current working state" : "",
    currentFiles.trim() ? "" : "",
    currentFiles.trim() ? "```" : "",
    currentFiles.trim() || "",
    currentFiles.trim() ? "```" : "",
    "",
    "---",
    "",
    'Say **"orient"** or **"pick up from handover"** to resume where you left off.',
    ""
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");

  // Show a preview
  console.log(`\nContinuation file: .tctbp/continuation/${fileName}`);
  console.log(`Lines: ${content.split("\\n").length}`);

  // Stage, commit, and push
  spawnSync("git", ["add", ".tctbp/continuation/"], { cwd: repoRoot, stdio: "inherit" });
  const commitResult = spawnSync("git", ["commit", "-m", "handover: continuation note"], { cwd: repoRoot, stdio: "inherit" });

  if (commitResult.status === 0) {
    spawnSync("git", ["push", "origin", branch], { cwd: repoRoot, stdio: "inherit" });
    console.log("Committed and pushed.");
  }

  return true;
}

function runGitCaptureSilent(args, cwd) {
  const { spawnSync } = require("child_process");
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) return "";
  return (result.stdout || "").trim();
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
    list: false,
    noContinuation: false
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

    if (arg === "--no-continuation") {
      parsed.noContinuation = true;
      continue;
    }

    fail(`Unknown option '${arg}'.`);
  }

  return parsed;
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-handover.js [--dry-run] [--no-continuation] [--list]");
  process.exit(exitCode);
}
