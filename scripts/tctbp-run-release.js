#!/usr/bin/env node

/**
 * tctbp-run-release.js — Full release pipeline orchestrator.
 *
 * Composes the existing TCTBP primitives (deploy, promote, ship) into a single
 * deterministic release pipeline: dev → staging → production.
 *
 * Usage:
 *   node scripts/tctbp-run-release.js --no-docs-impact "<reason>" [options]
 *
 * Options:
 *   --docs-updated "<reason>"      User-facing docs were updated
 *   --no-docs-impact "<reason>"    No user-facing docs impact
 *   --version X.Y.Z                Explicit version (default: from version source)
 *   --dry-run                      Print the plan without executing
 *   --yes                          Skip all interactive prompts
 *   --stop-at dev|staging|production Stop at a specific stage
 *   --list                         Show this help
 */

const { spawnSync } = require("child_process");
const readline = require("readline");
const {
  fail,
  fetchOrigin,
  getCurrentBranch,
  getWorkingTreeStatus,
  loadPolicy,
  logItem,
  logSection,
  printSummaryTable,
  readVersionSource,
  resolveBranchModel,
  resolveRepoPath,
  runMutableGit,
  runShipGates,
  repoRoot
} = require("./tctbp-core");

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

if (!options.docsNoteKind || !options.docsNote) {
  console.error("Exactly one docs-impact note is required.");
  printUsage(1);
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});

function parseArgs(argv) {
  const opts = {
    docsNoteKind: null,
    docsNote: null,
    version: null,
    dryRun: false,
    yes: false,
    stopAt: "production",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--docs-updated":
        opts.docsNoteKind = "docs-updated";
        opts.docsNote = argv[++i] || "";
        break;
      case "--no-docs-impact":
        opts.docsNoteKind = "no-docs-impact";
        opts.docsNote = argv[++i] || "";
        break;
      case "--version":
        opts.version = argv[++i] || "";
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--yes":
        opts.yes = true;
        break;
      case "--stop-at":
        opts.stopAt = argv[++i] || "production";
        if (!["dev", "staging", "production"].includes(opts.stopAt)) {
          console.error(`Invalid --stop-at '${opts.stopAt}'. Expected dev, staging, or production.`);
          printUsage(1);
        }
        break;
      case "--list":
        printUsage(0);
        break;
      default:
        break;
    }
  }

  return opts;
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-release.js --no-docs-impact \"<reason>\" [options]");
  console.log("");
  console.log("Options:");
  console.log("  --docs-updated \"<reason>\"      User-facing docs were updated");
  console.log("  --no-docs-impact \"<reason>\"    No user-facing docs impact");
  console.log("  --version X.Y.Z                Explicit version");
  console.log("  --dry-run                      Print the plan without executing");
  console.log("  --yes                          Skip all interactive prompts");
  console.log("  --stop-at dev|staging|production Stop at a specific stage");
  console.log("  --list                         Show this help");
  process.exit(exitCode);
}

function docsFlag() {
  return options.docsNoteKind === "docs-updated"
    ? ["--docs-updated", options.docsNote]
    : ["--no-docs-impact", options.docsNote];
}

function runStep(stepType, target, requiredBranch, extraArgs = []) {
  const runners = {
    deploy: "scripts/tctbp-run-deploy.js",
    promote: "scripts/tctbp-run-promote.js",
    ship: "scripts/tctbp-run-ship.js",
  };

  const scriptName = runners[stepType];
  if (!scriptName) fail(`Unknown step type: ${stepType}`);

  if (options.dryRun) {
    console.log(`\n[dry-run] Would run: node ${scriptName} ${target} ${docsFlag().join(" ")} ${extraArgs.join(" ")} (on branch ${requiredBranch})`);
    return;
  }

  const current = getCurrentBranch();
  if (current !== requiredBranch) {
    runMutableGit(["checkout", requiredBranch], false, `Switch to ${requiredBranch} for ${stepType} ${target}`);
  }

  const args = [target, ...docsFlag(), ...extraArgs];
  const runnerScript = resolveRepoPath(scriptName);
  const result = spawnSync("node", [runnerScript, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) fail(`${stepType} ${target} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${stepType} ${target} failed with exit code ${result.status}.`);
}

function prompt(question) {
  if (options.yes) {
    console.log(`${question} (y/N) y (--yes)`);
    return Promise.resolve(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function restoreBranch(branch) {
  try {
    const current = getCurrentBranch();
    if (current !== branch && branch !== "HEAD") {
      runMutableGit(["checkout", branch], false, `Return to ${branch}`);
      console.log(`\nReturned to ${branch}.`);
    }
  } catch {
    console.error(`\nCould not restore original branch '${branch}'. You are on '${getCurrentBranch()}'.`);
  }
}

async function main() {
  const config = loadPolicy();
  const startBranch = getCurrentBranch();

  if (startBranch === "HEAD") fail("Release stopped because HEAD is detached.");

  const workingTree = getWorkingTreeStatus();
  if (workingTree.length > 0) fail("Release stopped because the working tree is not clean.");

  const versionSource = readVersionSource(config);
  const version = options.version || versionSource.version;
  const stopAfterDev = options.stopAt === "dev";
  const stopAfterStaging = options.stopAt === "staging";

  // Determine branch names from the configured strategy
  const branchModel = resolveBranchModel(config);
  const strategy = branchModel.strategy;
  const devBranch = branchModel.workingBranch || "development";
  const stagingBranch = branchModel.preProductionBranch || "staging";
  const prodBranch = branchModel.productionBranch;
  const useReviewAlias = Boolean(branchModel.reviewBranch);

  logSection("Release");
  logItem("Version", version);
  logItem("Start branch", startBranch);
  logItem("Strategy", strategy);
  logItem("Docs impact", `${options.docsNoteKind === "docs-updated" ? "Docs updated" : "No docs impact"}: ${options.docsNote}`);
  logItem("Mode", options.dryRun ? "dry-run" : "live");
  logItem("Stop at", options.stopAt);

  // ── Pre-flight gates ─────────────────────────────────────────────────────
  logSection("Pre-flight gates");
  fetchOrigin(options.dryRun);

  if (!options.dryRun) {
    runMutableGit(["checkout", devBranch], false, `Switch to ${devBranch} for gates`);
  }

  runShipGates(options.dryRun);

  // ── Stage 1: Development ─────────────────────────────────────────────────
  logSection("Stage 1: Development");

  console.log(`\n--- Deploy ${devBranch} ---`);
  runStep("deploy", "dev", devBranch);

  if (stopAfterDev) {
    console.log(`\nStopped at development (--stop-at ${options.stopAt}).`);
    restoreBranch(startBranch);
    return;
  }

  if (!(await prompt("Development deployed. Continue to staging?"))) {
    console.log("Release cancelled.");
    restoreBranch(startBranch);
    return;
  }

  // ── Stage 2: Staging ─────────────────────────────────────────────────────
  logSection("Stage 2: Staging");

  const promoteStagingTarget = useReviewAlias ? "review" : "staging";

  console.log(`\n--- Promote to ${stagingBranch} ---`);
  runStep("promote", promoteStagingTarget, devBranch);

  console.log(`\n--- Deploy ${stagingBranch} ---`);
  const deployStagingTarget = useReviewAlias ? "review" : "staging";
  runStep("deploy", deployStagingTarget, stagingBranch);

  if (stopAfterStaging) {
    console.log(`\nStopped at staging (--stop-at ${options.stopAt}).`);
    restoreBranch(startBranch);
    return;
  }

  if (!(await prompt("Staging deployed. Continue to production?"))) {
    console.log("Release cancelled.");
    restoreBranch(startBranch);
    return;
  }

  // ── Stage 3: Production ──────────────────────────────────────────────────
  logSection("Stage 3: Production");

  console.log(`\n--- Promote to production ---`);
  runStep("promote", "production", stagingBranch);

  const shipArgs = options.yes ? ["--yes"] : [];
  console.log(`\n--- Ship ---`);
  runStep("ship", "", prodBranch, shipArgs);

  console.log(`\n--- Deploy production ---`);
  runStep("deploy", "production", prodBranch);

  // ── Finalize ─────────────────────────────────────────────────────────────
  logSection("Release complete");

  const finalVersionSource = readVersionSource(config);
  const finalVersion = finalVersionSource.version;

  printSummaryTable([
    { origin: "n/a", local: devBranch, status: "Development", actions: `Version: ${finalVersion}` },
    { origin: "n/a", local: stagingBranch, status: "Staging", actions: `Version: ${version}` },
    { origin: "n/a", local: prodBranch, status: "Production", actions: `Version: ${version}` },
  ]);

  console.log(`\nTag: v${version}`);
  console.log(`Original branch: ${startBranch}`);

  restoreBranch(startBranch);
}
