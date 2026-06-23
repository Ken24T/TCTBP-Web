#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolvePolicyPath, resolveRepoRoot, resolveRuntimeCwd } = require("./tctbp-runtime");

const repoRoot = resolveRepoRoot();
const policyPath = resolvePolicyPath(repoRoot);
const runtimeCwd = resolveRuntimeCwd(repoRoot);

function loadPolicy() {
  try {
    return JSON.parse(fs.readFileSync(policyPath, "utf8"));
  } catch (error) {
    fail(`Could not read ${policyPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function logSection(title) {
  console.log(title);
  console.log("=".repeat(title.length));
}

function logItem(label, value) {
  console.log(`${label}: ${value}`);
}

function resolveRepoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function maybeReadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function runGitResult(args) {
  return spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runGitCapture(args, description, allowEmpty = false) {
  const result = runGitResult(args);

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

function tryGitCapture(args) {
  const result = runGitResult(args);

  if (result.error) {
    return null;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    return null;
  }

  return (result.stdout || "").trim();
}

function runMutableGit(args, dryRun, description, options = {}) {
  const { readOnly = false } = options;

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

function runCommand(command, args, dryRun, description, options = {}) {
  const { cwd = repoRoot, shell = process.platform === "win32" } = options;

  if (dryRun) {
    console.log(`[dry-run] ${description}: ${command} ${args.join(" ")}`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell
  });

  if (result.error) {
    fail(`${description} failed: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    fail(`${description} failed with exit code ${result.status}.`);
  }
}

function runShellCommand(command, dryRun, description, options = {}) {
  const { cwd = repoRoot } = options;

  if (dryRun) {
    console.log(`[dry-run] ${description}: ${command}`);
    return;
  }

  const result = spawnSync(command, {
    cwd,
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

function fetchOrigin(dryRun, includeTags = false) {
  const args = includeTags ? ["fetch", "--prune", "--tags", "origin"] : ["fetch", "--prune", "origin"];
  runMutableGit(args, dryRun, "Fetch origin before workflow preflight");
}

function getCurrentBranch() {
  return runGitCapture(["rev-parse", "--abbrev-ref", "HEAD"], "Determine the current branch");
}

function getHeadCommit(short = false) {
  return runGitCapture(short ? ["rev-parse", "--short", "HEAD"] : ["rev-parse", "HEAD"], "Resolve HEAD commit");
}

function getHeadSummary() {
  return runGitCapture(["log", "-1", "--oneline", "--decorate=short", "--no-color", "HEAD"], "Resolve HEAD summary", true) || "unknown";
}

function getWorkingTreeStatus() {
  return runGitCapture(["status", "--porcelain", "--untracked-files=all"], "Inspect working tree state", true);
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

function summariseWorkingTree(statusOutput) {
  const lines = statusOutput
    .split(/\r?\n/)
    .map((value) => value.trimEnd())
    .filter((value) => value.length > 0);

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

  return {
    counts,
    isClean: lines.length === 0,
    lines,
    summary: lines.length === 0 ? "clean" : `dirty (${lines.length} path${lines.length === 1 ? "" : "s"}: ${summaryParts.join(", ")})`
  };
}

function printDirtySummary(statusOutput, label, stagedLine) {
  const summary = summariseWorkingTree(statusOutput);

  if (summary.lines.length === 0) {
    return;
  }

  console.log(`${label} (${summary.lines.length} file(s)): ${summary.summary.replace(/^dirty \(\d+ paths?: /, "").replace(/\)$/, "")}`);
  console.log(stagedLine);

  for (const line of summary.lines) {
    console.log(`- ${line}`);
  }
}

function gitRefExists(refName) {
  const result = spawnSync("git", ["rev-parse", "--verify", refName], {
    cwd: repoRoot,
    stdio: "ignore"
  });

  return result.status === 0;
}

function gitLocalBranchExists(branchName) {
  return gitRefExists(`refs/heads/${branchName}`);
}

function gitRemoteBranchExists(branchName) {
  return gitRefExists(`refs/remotes/origin/${branchName}`);
}

function getShortRef(refName) {
  if (!gitRefExists(refName)) {
    return null;
  }

  return runGitCapture(["rev-parse", "--short", refName], `Resolve ${refName}`);
}

function inspectBranchSyncState(branchName, options = {}) {
  const remoteExists = options.remoteExists === undefined ? gitRemoteBranchExists(branchName) : options.remoteExists;

  if (!remoteExists) {
    return {
      ahead: 0,
      behind: 0,
      diverged: false
    };
  }

  const localRef = options.localRef || `refs/heads/${branchName}`;
  const output = runGitCapture(
    ["rev-list", "--left-right", "--count", `${localRef}...refs/remotes/origin/${branchName}`],
    `Inspect sync state for ${branchName}`
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

function stopIfBehindOrDiverged(remoteState, remoteBranchLabel, prefix = "Workflow") {
  if (remoteState.diverged) {
    fail(`${prefix} stopped because the local branch has diverged from ${remoteBranchLabel}.`);
  }

  if (remoteState.behind > 0) {
    fail(`${prefix} stopped because the local branch is behind ${remoteBranchLabel} by ${remoteState.behind} commit(s).`);
  }
}

function getDefaultRemote() {
  const remotesOutput = runGitCapture(["remote"], "List configured remotes", true);
  const remotes = remotesOutput
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (remotes.includes("origin")) {
    return "origin";
  }

  if (remotes.length > 0) {
    return remotes[0];
  }

  fail("No git remotes are configured.");
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

function detectGitOperationState() {
  const gitDirRelative = runGitCapture(["rev-parse", "--git-dir"], "Resolve git directory", true) || ".git";
  const gitDir = path.resolve(repoRoot, gitDirRelative);
  const states = [];

  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
    states.push("merge");
  }

  if (fs.existsSync(path.join(gitDir, "rebase-apply")) || fs.existsSync(path.join(gitDir, "rebase-merge"))) {
    states.push("rebase");
  }

  if (fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD"))) {
    states.push("cherry-pick");
  }

  if (fs.existsSync(path.join(gitDir, "REVERT_HEAD"))) {
    states.push("revert");
  }

  return states;
}

function getReleaseTagPattern(config) {
  const configuredFormat =
    config && config.profile && config.profile.versioning && typeof config.profile.versioning.tagFormat === "string"
      ? config.profile.versioning.tagFormat
      : "v{version}";
  const patternSource = configuredFormat
    .split("{version}")
    .map((segment) => escapeRegExp(segment))
    .join("\\d+\\.\\d+\\.\\d+");

  return new RegExp(`^${patternSource}$`);
}

function getReleaseTagGlob(config) {
  const configuredFormat =
    config && config.profile && config.profile.versioning && typeof config.profile.versioning.tagFormat === "string"
      ? config.profile.versioning.tagFormat
      : "v{version}";

  return configuredFormat.replace("{version}", "*");
}

function getReachableReleaseTag(config, refName = "HEAD") {
  const tag = tryGitCapture(["describe", "--tags", "--abbrev=0", "--match", getReleaseTagGlob(config), refName]);
  return tag && getReleaseTagPattern(config).test(tag) ? tag : null;
}

function getTagsPointingAtHead(config) {
  const releaseTagPattern = getReleaseTagPattern(config);
  const tags = runGitCapture(["tag", "--points-at", "HEAD"], "Inspect release tags at HEAD", true);

  return tags
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && releaseTagPattern.test(value));
}

function gitRemoteTagExists(tagName) {
  const result = spawnSync("git", ["ls-remote", "--tags", "origin", `refs/tags/${tagName}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    fail(`Inspect remote release tags failed: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    fail(`Inspect remote release tags failed${stderr ? `: ${stderr}` : "."}`);
  }

  return Boolean((result.stdout || "").trim());
}

function readVersionSource(config) {
  const relativePath =
    config && config.profile && config.profile.versioning && typeof config.profile.versioning.sourceOfTruth === "string"
      ? config.profile.versioning.sourceOfTruth
      : null;

  if (!relativePath) {
    return {
      path: "n/a",
      version: "n/a"
    };
  }

  const absolutePath = resolveRepoPath(relativePath);

  // Try JSON first (package.json, etc.)
  const json = maybeReadJsonFile(absolutePath);
  if (json && typeof json.version === "string") {
    return {
      path: relativePath,
      version: json.version
    };
  }

  // Fall back to plain-text version file (VERSION, etc.)
  try {
    const text = require("fs").readFileSync(absolutePath, "utf8").trim();
    if (text.length > 0 && text.length < 64) {
      return {
        path: relativePath,
        version: text.split(/\r?\n/)[0].trim()
      };
    }
  } catch (_error) {
    // File doesn't exist or can't be read; fall through.
  }

  return {
    path: relativePath,
    version: "unknown"
  };
}

function formatSyncStatus(syncState, remoteExists) {
  if (!remoteExists) {
    return "Unpublished";
  }

  if (syncState.diverged) {
    return `Diverged (ahead ${syncState.ahead}, behind ${syncState.behind})`;
  }

  if (syncState.ahead > 0) {
    return `Ahead of origin by ${syncState.ahead}`;
  }

  if (syncState.behind > 0) {
    return `Behind origin by ${syncState.behind}`;
  }

  return "In sync";
}

function printSummaryTable(rows) {
  console.log("");
  console.log("| Origin | Local | Status | Action(s) |");
  console.log("| --- | --- | --- | --- |");

  for (const row of rows) {
    console.log(
      `| ${escapeTableCell(row.origin)} | ${escapeTableCell(row.local)} | ${escapeTableCell(row.status)} | ${escapeTableCell(row.actions)} |`
    );
  }

  console.log("");
}

function resolveStatusRecommendations(input) {
  const recommendations = [];

  if (input.operationStates.length > 0) {
    recommendations.push("abort");
  }

  if (input.currentBranch !== "HEAD") {
    if (input.currentSyncState.diverged || input.currentSyncState.behind > 0) {
      recommendations.push("resume");
    }

    if (!input.workingTreeSummary.isClean) {
      recommendations.push("checkpoint");
    }

    if (input.currentRemoteExists === false || input.currentSyncState.ahead > 0) {
      recommendations.push("publish");
    }

    if (input.currentBranch === input.defaultBranch && input.shipReadiness.ready) {
      recommendations.push("ship");
    }

    if (input.enableHandoverSuggestions === true && (!input.workingTreeSummary.isClean || input.currentSyncState.ahead > 0)) {
      recommendations.push("handover");
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("none");
  }

  return [...new Set(recommendations)];
}

function parseSemVer(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    fail(`Unsupported version format '${version}' (expected X.Y.Z).`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function stepSemVer(version, bump) {
  const parsed = parseSemVer(version);

  if (bump === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }

  if (bump === "major") {
    return `${parsed.major + 1}.0.0`;
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function updateJsonFileRaw(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf8");

  for (const [needle, replacementValue] of Object.entries(replacements)) {
    const pattern = new RegExp(escapeRegExp(needle), "g");
    content = content.replace(pattern, replacementValue);
  }

  fs.writeFileSync(filePath, content, "utf8");
}

function runShipGates(dryRun) {
  const packageJson = maybeReadJsonFile(path.join(runtimeCwd, "package.json"));

  if (!packageJson || !packageJson.scripts) {
    fail(`Could not read ${path.join(runtimeCwd, "package.json")} for ship gates.`);
  }

  const commands = [];

  if (packageJson.scripts["format:check"]) {
    commands.push(["npm", ["run", "format:check"], "Format gate"]);
  }

  if (packageJson.scripts.lint) {
    commands.push(["npm", ["run", "lint"], "Lint gate"]);
  }

  if (packageJson.scripts.typecheck) {
    commands.push(["npm", ["run", "typecheck"], "Typecheck gate"]);
  }

  if (packageJson.scripts.test) {
    commands.push(["npm", ["test"], "Test gate"]);
  }

  if (packageJson.scripts.build) {
    commands.push(["npm", ["run", "build"], "Build gate"]);
  }

  if (commands.length === 0) {
    fail("No ship gates are configured in the local runtime package.json.");
  }

  for (const [command, args, label] of commands) {
    runCommand(command, args, dryRun, label, { cwd: runtimeCwd });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeTableCell(value) {
  return String(value ?? "n/a").replace(/\|/g, "\\|");
}

module.exports = {
  createTimestamp,
  detectGitOperationState,
  fail,
  fetchOrigin,
  formatSyncStatus,
  getCurrentBranch,
  getDefaultRemote,
  getHeadCommit,
  getHeadSummary,
  getReachableReleaseTag,
  getReleaseTagPattern,
  getShortRef,
  getTagsPointingAtHead,
  getWorkingTreeStatus,
  gitLocalBranchExists,
  gitRefExists,
  gitRemoteBranchExists,
  gitRemoteTagExists,
  inspectBranchSyncState,
  loadPolicy,
  logItem,
  logSection,
  path,
  policyPath,
  printDirtySummary,
  printSummaryTable,
  readJsonFile,
  readVersionSource,
  repoRoot,
  resolveRepoPath,
  resolveStatusRecommendations,
  runCommand,
  runGitCapture,
  runMutableGit,
  runShellCommand,
  runShipGates,
  runtimeCwd,
  stepSemVer,
  stopIfBehindOrDiverged,
  summariseWorkingTree,
  updateJsonFileRaw
};
