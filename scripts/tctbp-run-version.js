#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");
const { fail } = require("./tctbp-core");

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

main(options);

function main(cliOptions) {
  const scriptPath = path.join(__dirname, "version-status.mjs");
  const passthroughArgs = [];

  if (cliOptions.strict) {
    passthroughArgs.push("--strict");
  }

  const result = spawnSync(process.execPath, [scriptPath, ...passthroughArgs], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    fail(`Version runner failed: ${result.error.message}`);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

function parseArgs(argv) {
  const parsed = {
    list: false,
    strict: false,
  };

  for (const arg of argv) {
    if (arg === "--list") {
      parsed.list = true;
      continue;
    }

    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }

    fail(`Unknown option '${arg}'.`);
  }

  return parsed;
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-version.js [--strict] [--list]");
  process.exit(exitCode);
}
