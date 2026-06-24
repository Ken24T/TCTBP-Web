#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { repoRoot } = require("./tctbp-core");

const repoName = path.basename(repoRoot);
const continuationDir = path.join(repoRoot, ".tctbp", "continuation");

let files = [];
try {
  files = fs.readdirSync(continuationDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
} catch (_) {
  // No directory
}

console.log("");
console.log("═".repeat(64));
console.log(`  ORIENT — ${repoName}`);
console.log("═".repeat(64));

if (files.length === 0) {
  console.log("");
  console.log("  No continuation files found in this repo.");
  console.log("");
  console.log("  Use 'handover please' before ending a session to create one.");
  console.log("  The Copilot agent will write a full session summary");
  console.log("  with accomplishments, decisions, gotchas, and next steps.");
  console.log("");
  console.log("═".repeat(64));
  process.exit(0);
}

const newest = files[files.length - 1];
const filePath = path.join(continuationDir, newest);
const content = fs.readFileSync(filePath, "utf8");

// ── Parse ────────────────────────────────────────────────────────────────

const dateMatch = content.match(/^# Handover Continuation — (.+)$/m);
const branchMatch = content.match(/\*\*Branch:\*\*\s*(\S+)/);
const commitMatch = content.match(/\*\*Last commit:\*\*\s*(\S+)/);
const rangeMatch = content.match(/\*\*Session range:\*\*\s*(\S+)/);
const hasCopilotNote = content.includes("## Copilot Session Summary");

// Accomplishments from Copilot narrative
const acc = [];
if (hasCopilotNote) {
  const noteStart = content.indexOf("### What was accomplished");
  const nextH3 = content.indexOf("###", noteStart + 10);
  const accSection = nextH3 >= 0 ? content.slice(noteStart, nextH3) : content.slice(noteStart);
  const re = /^-\s+(.+)$/gm;
  let m;
  while ((m = re.exec(accSection)) !== null) acc.push(m[1].trim());
}

// Gotchas
const gotchas = [];
const gs = content.indexOf("### Gotchas");
if (gs >= 0) {
  const ge = content.indexOf("##", gs + 10);
  const gSection = ge >= 0 ? content.slice(gs, ge) : content.slice(gs);
  const gre = /^\d+\.\s+(.+)$/gm;
  let m;
  while ((m = gre.exec(gSection)) !== null) gotchas.push(m[1].trim());
}

// Next session
const nextItems = [];
const ns = content.indexOf("### Next session");
if (ns >= 0) {
  const ne = content.indexOf("##", ns + 10);
  const nSection = ne >= 0 ? content.slice(ns, ne) : content.slice(ns);
  const nre = /^-\s+(.+)$/gm;
  let m;
  while ((m = nre.exec(nSection)) !== null) {
    const line = m[1].trim();
    if (line.startsWith("Primary:") || line.startsWith("Secondary:")) nextItems.push(line);
  }
}

// Repos referenced
const repos = [];
const rre = /`(\/home\/[^`]+\/repos\/[^`]+)`/g;
let r;
while ((r = rre.exec(content)) !== null) {
  if (!repos.includes(r[1])) repos.push(r[1]);
}

// Auto stats
const newMatch = content.match(/(\d+) new file\(s\)/);
const modMatch = content.match(/(\d+) modified/);
const deltaMatch = content.match(/Net change: ([+-]\d+) lines/);
const fileMatch = content.match(/across (\d+) file\(s\)/);

// ── Report ───────────────────────────────────────────────────────────────

console.log("");
console.log("  📋 INTERPRETATION");
console.log("");

if (dateMatch) console.log(`  Left off:  ${dateMatch[1]}`);
if (branchMatch) console.log(`  Branch:    ${branchMatch[1]}`);
if (commitMatch) console.log(`  Commit:    ${commitMatch[1]}`);
if (rangeMatch) console.log(`  Range:     ${rangeMatch[1]}`);
console.log(`  Files:     ${files.length} continuation(s), using newest`);

if (hasCopilotNote) {
  console.log("");
  console.log("  ✅ Full Copilot session summary — narrative context present.");
} else {
  console.log("");
  console.log("  ⚠️  Git-only summary in this file. An earlier file may have richer context.");
}

if (fileMatch) {
  console.log("");
  console.log("  📊 SCOPE");
  if (newMatch) console.log(`  New:       ${newMatch[1]} files`);
  if (modMatch) console.log(`  Modified:  ${modMatch[1]} files`);
  if (deltaMatch) console.log(`  Delta:     ${deltaMatch[1]} lines`);
}

if (acc.length > 0) {
  console.log("");
  console.log("  🎯 ACCOMPLISHMENTS");
  for (const item of acc.slice(0, 15)) {
    console.log(`  • ${item.replace(/\\`/g, "`")}`);
  }
  if (acc.length > 15) console.log(`  ... and ${acc.length - 15} more`);
}

if (gotchas.length > 0) {
  console.log("");
  console.log("  ⚠️  GOTCHAS");
  for (const g of gotchas.slice(0, 6)) {
    console.log(`  ${g.substring(0, 118)}${g.length > 118 ? "..." : ""}`);
  }
}

if (nextItems.length > 0) {
  console.log("");
  console.log("  ▸ NEXT");
  for (const item of nextItems) console.log(`  ${item}`);
}

if (repos.length > 0) {
  console.log("");
  console.log("  📁 REPOS");
  for (const p of repos) console.log(`  ${p}`);
}

console.log("");
console.log("═".repeat(64));
const confidence = hasCopilotNote ? "HIGH — full narrative + git context" : "MEDIUM — git context, enough to resume";
console.log(`  Confidence: ${confidence}`);
console.log(`  Source: ${filePath}`);
console.log("═".repeat(64));
console.log("");
