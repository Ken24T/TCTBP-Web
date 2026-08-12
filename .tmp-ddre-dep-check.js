"use strict";
// Read-only dependency check: can the canonical preflight runner load on ddre's lineage?
const path = require("path");
const fs = require("fs");
const d = "/home/ken/Documents/development/repos/ddre-intranet-local";

function exportsOf(file) {
  const src = fs.readFileSync(path.join(d, "scripts", file), "utf8");
  const m = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return { raw: src.slice(-300), has: (name) => false };
  const body = m[1];
  return { has: (name) => new RegExp("\\b" + name + "\\b").test(body) };
}

const checks = [
  ["tctbp-runtime.js", ["resolveRepoRoot", "resolveRuntimeCwd", "resolvePolicyPath"]],
  ["tctbp-git-ops.js", ["detectGitOperationState", "getCurrentBranch", "getWorkingTreeStatus"]],
  ["tctbp-profile-io.js", ["loadPolicy"]],
  ["tctbp-output.js", ["fail", "logSection"]],
];
for (const [file, names] of checks) {
  if (!fs.existsSync(path.join(d, "scripts", file))) { console.log(file + ": MISSING"); continue; }
  const ex = exportsOf(file);
  console.log(file + ": " + names.map((n) => n + "=" + (ex.has(n) ? "yes" : "NO")).join(" "));
}
console.log("tctbp-gates.js present in ddre:", fs.existsSync(path.join(d, "scripts", "tctbp-gates.js")));
// Also check whether ddre's package.json has the npm scripts the hardcoded gate map uses
const pkg = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8"));
console.log("ddre package.json scripts present:", JSON.stringify(Object.keys(pkg.scripts || {})));
