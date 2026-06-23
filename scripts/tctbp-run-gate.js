#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { resolveRepoRoot, resolveRuntimeCwd } = require("./tctbp-runtime");

const repoRoot = resolveRepoRoot();
const runtimeCwd = resolveRuntimeCwd(repoRoot);

const gates = {
  format: ["npm", ["run", "format:check"]],
  test: ["npm", ["test"]],
  lint: ["npm", ["run", "lint"]],
  build: ["npm", ["run", "build"]],
  "release-build": ["npm", ["run", "build"]]
};

const args = process.argv.slice(2);
const gate = args[0];
const dryRun = args.includes("--dry-run");
const listOnly = args.includes("--list");

if (!gate || listOnly) {
  printUsage(listOnly ? 0 : 1);
}

const commandConfig = gates[gate];

if (!commandConfig) {
  console.error(`Unknown gate '${gate}'.`);
  printUsage(1);
}

const [command, commandArgs] = commandConfig;

if (dryRun) {
  console.log(`${command} ${commandArgs.join(" ")}`);
  console.log(runtimeCwd);
  process.exit(0);
}

const result = spawnSync(command, commandArgs, {
  cwd: runtimeCwd,
  stdio: "inherit",
  shell: process.platform === "win32"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-gate.js <format|test|lint|build|release-build> [--dry-run] [--list]");
  process.exit(exitCode);
}
