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
  logItem("Mode", cliOptions.localOnly ? "local-only" : cliOptions.dryRun ? "dry-run" : "live");

  if (!cliOptions.localOnly) {
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
  }

  let originBefore = null;
  let remoteExistsBefore = false;
  let remoteExistsAfter = false;
  let syncStateAfter = null;
  let originAfter = null;

  if (!cliOptions.localOnly) {
    remoteExistsBefore = gitRemoteBranchExists(branch);
    originBefore = remoteExistsBefore ? getShortRef(`refs/remotes/origin/${branch}`) : null;
  }

  const preHead = getHeadCommit(true);
  const preWorkingTree = summariseWorkingTree(getWorkingTreeStatus());

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

  if (!cliOptions.localOnly) {
    runCommand(
      "node",
      ["scripts/tctbp-run-publish.js", ...(cliOptions.dryRun ? ["--dry-run"] : [])],
      cliOptions.dryRun,
      "Run publish step during handover"
    );

    remoteExistsAfter = cliOptions.dryRun ? remoteExistsBefore : gitRemoteBranchExists(branch);
    syncStateAfter = cliOptions.dryRun
      ? inspectBranchSyncState(branch, { remoteExists: remoteExistsBefore, localRef: "HEAD" })
      : inspectBranchSyncState(branch, { remoteExists: remoteExistsAfter, localRef: "HEAD" });
    originAfter = remoteExistsAfter ? getShortRef(`refs/remotes/origin/${branch}`) : null;

    if (!cliOptions.dryRun && (!remoteExistsAfter || syncStateAfter.ahead > 0 || syncStateAfter.behind > 0 || syncStateAfter.diverged)) {
      fail("Handover stopped because branch sync could not be verified after publication.");
    }
  } else {
    console.log("Local-only mode: skipping publish step.");
  }

  const finalHead = getHeadCommit(true);
  const finalWorkingTree = summariseWorkingTree(getWorkingTreeStatus());

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
      actions: checkpointCreated ? "Local checkpoint created." : "Skipped because working tree was already clean."
    },
    ...(cliOptions.localOnly ? [{
      origin: "n/a",
      local: `${branch} @ ${finalHead}`,
      status: "Publish step",
      actions: "Skipped — local-only mode. No remote interaction."
    }] : [{
      origin: `${originBefore || "n/a"} -> ${originAfter || "n/a"}`,
      local: `${branch} @ ${finalHead}`,
      status: `Upstream sync: ${syncStateAfter ? formatSyncStatus(syncStateAfter, remoteExistsAfter) : "n/a"}`,
      actions: cliOptions.dryRun ? "Dry run only; no remote update occurred." : "Branch publication and sync verification completed."
    }]),
    {
      origin: "n/a",
      local: finalWorkingTree.summary,
      status: "Final baseline",
      actions: finalWorkingTree.isClean
        ? (continuationWritten ? "Ready to resume. Continuation note saved." : "Ready to resume.")
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

  // ── Gather git context ────────────────────────────────────────────────

  const sessionStartRef = resolveSessionStartRef();
  const gitLog = runGitCaptureSilent(
    ["log", "--oneline", "--decorate", `${sessionStartRef}..HEAD`],
    repoRoot
  );
  const commitList = gitLog
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fileDiff = runGitCaptureSilent(
    ["diff", "--stat", `${sessionStartRef}..HEAD`],
    repoRoot
  );
  const fileNames = runGitCaptureSilent(
    ["diff", "--name-only", `${sessionStartRef}..HEAD`],
    repoRoot
  );
  const fileList = fileNames
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const untrackedFiles = runGitCaptureSilent(
    ["ls-files", "--others", "--exclude-standard"],
    repoRoot
  );

  // ── Multi-line prompt helper ──────────────────────────────────────────

  const askMultiline = (rl, prompt) => new Promise((resolve) => {
    const lines = [];
    console.log(`\n${prompt}`);
    console.log("(Type your response. Press Enter on an empty line to finish.)");
    rl.setPrompt("> ");
    rl.prompt();
    rl.on("line", (line) => {
      if (line.trim() === "" && lines.length > 0) {
        rl.removeAllListeners("line");
        resolve(lines.join("\n"));
      } else if (line.trim() !== "") {
        lines.push(line);
        rl.prompt();
      } else {
        rl.prompt();
      }
    });
  });

  // ── Interview ─────────────────────────────────────────────────────────

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  // Show git context before interview
  if (commitList.length > 0) {
    console.log(`\nSession activity (${commitList.length} commit(s) since ${sessionStartRef}):`);
    for (const c of commitList.slice(0, 20)) {
      console.log(`  ${c}`);
    }
    if (commitList.length > 20) {
      console.log(`  ... and ${commitList.length - 20} more`);
    }
  }

  if (fileList.length > 0) {
    console.log(`\nFiles touched this session (${fileList.length}):`);
    for (const f of fileList.slice(0, 30)) {
      console.log(`  ${f}`);
    }
    if (fileList.length > 30) {
      console.log(`  ... and ${fileList.length - 30} more`);
    }
  }

  console.log("\n--- Handover Continuation ---");
  console.log("This creates a detailed context file so you (or an AI) can pick up where you left off.");
  console.log("Be generous — narrative, decisions, gotchas. The more detail, the better the resume.\n");

  // Q1: Session summary (multi-line)
  const summary = await askMultiline(rl, "▸ Session Summary — What did you accomplish? Key decisions made? Why?");
  rl.close();

  // Q2: Plan progress
  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const planProgress = await askMultiline(rl2, "▸ Plan Progress — What got done? What's still open? (Checklist format)");
  rl2.close();

  // Q3: Mistakes & gotchas
  const rl3 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const gotchas = await askMultiline(rl3, "▸ Mistakes & Gotchas — What broke? What should the next person avoid?");
  rl3.close();

  // Q4: Next session
  const rl4 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const nextSession = await askMultiline(rl4, "▸ Next Session — What's the very next thing to work on, specifically?");
  rl4.close();

  // ── Assemble document ─────────────────────────────────────────────────

  const timestamp = createTimestamp();
  const dateStr = new Date().toISOString().replace("T", " ").slice(0, 19);
  const continuationDir = path.join(repoRoot, ".tctbp", "continuation");
  fs.mkdirSync(continuationDir, { recursive: true });

  const fileName = `${timestamp}-handover.md`;
  const filePath = path.join(continuationDir, fileName);

  // Build files-touched table from diff --stat
  let filesTable = "";
  const diffLines = fileDiff.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (diffLines.length > 0) {
    filesTable = "| File | Change |\n|------|--------|\n";
    for (const line of diffLines) {
      const parts = line.split("|");
      if (parts.length >= 2) {
        filesTable += `| \`${parts[0].trim()}\` | ${parts[1].trim()} |\n`;
      }
    }
  }

  // Build checkpoint log from commit list
  let checkpoints = "";
  if (commitList.length > 0) {
    checkpoints = "| Commit | Message |\n|--------|--------|\n";
    for (const c of commitList) {
      const firstSpace = c.indexOf(" ");
      const sha = firstSpace > 0 ? c.slice(0, firstSpace) : c;
      const msg = firstSpace > 0 ? c.slice(firstSpace + 1) : "";
      checkpoints += `| \`${sha}\` | ${msg} |\n`;
    }
  }

  const content = [
    `# Handover Continuation — ${dateStr.slice(0, 10)}`,
    "",
    "## Session Summary",
    "",
    summary.trim() || "_No summary provided._",
    "",
    "## Plan Progress",
    "",
    planProgress.trim() || "_No plan progress recorded._",
    "",
    gotchas.trim() ? "## Mistakes & Gotchas" : "",
    gotchas.trim() || "",
    "",
    "## Files Touched",
    "",
    filesTable || "_No files changed this session._",
    "",
    "## Checkpoint Log",
    "",
    checkpoints || "_No commits this session._",
    "",
    "## Branch & Commit Context",
    "",
    `- **Branch:** ${branch}`,
    `- **Last commit:** ${commit}`,
    `- **Working tree:** ${untrackedFiles.trim() ? "has untracked files" : "clean"}`,
    `- **Session range:** ${sessionStartRef}..HEAD`,
    "",
    "## Next Session",
    "",
    nextSession.trim() || "_No next steps recorded._",
    "",
    "---",
    "",
    `*Generated by TCTBP handover on ${dateStr}*`,
    ""
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");

  console.log(`\nContinuation file: .tctbp/continuation/${fileName}`);
  console.log(`Sections: summary, plan progress, ${gotchas.trim() ? "mistakes & gotchas, " : ""}files touched, checkpoint log, next session`);

  // Stage, commit, and push
  spawnSync("git", ["add", ".tctbp/continuation/"], { cwd: repoRoot, stdio: "inherit" });
  const commitResult = spawnSync("git", ["commit", "-m", "handover: continuation note"], { cwd: repoRoot, stdio: "inherit" });

  if (commitResult.status === 0) {
    spawnSync("git", ["push", "origin", branch], { cwd: repoRoot, stdio: "inherit" });
    console.log("Committed and pushed.");
  }

  return true;
}

function resolveSessionStartRef() {
  // Try the last shipped tag first, then HEAD~20, then the root commit.
  const { spawnSync } = require("child_process");
  const tagResult = spawnSync("git", ["describe", "--tags", "--abbrev=0"], {
    cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  });
  const tag = (tagResult.stdout || "").trim();
  if (tag) return tag;

  // No tags — try 20 commits back
  const checkResult = spawnSync("git", ["rev-parse", "--verify", "HEAD~20"], {
    cwd: repoRoot, stdio: "ignore"
  });
  if (checkResult.status === 0) return "HEAD~20";

  // Very young repo — use the root commit
  return "HEAD~1";
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
    localOnly: false,
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

    if (arg === "--local-only") {
      parsed.localOnly = true;
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
  console.log("Usage: node scripts/tctbp-run-handover.js [--dry-run] [--local-only] [--no-continuation] [--list]");
  process.exit(exitCode);
}
