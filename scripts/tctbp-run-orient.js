#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { repoRoot } = require("./tctbp-core");

const continuationDir = path.join(repoRoot, ".tctbp", "continuation");

let files = [];
try {
  files = fs.readdirSync(continuationDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
} catch (_) {
  console.log("No handover continuation files found.");
  console.log("Use 'handover' to create one before ending a session.");
  process.exit(0);
}

if (files.length === 0) {
  console.log("No handover continuation files found.");
  console.log("Use 'handover' to create one before ending a session.");
  process.exit(0);
}

const newest = files[files.length - 1];
const filePath = path.join(continuationDir, newest);
const content = fs.readFileSync(filePath, "utf8");

// Extract key sections
const dateMatch = content.match(/^# Handover Continuation — (.+)$/m);
const branchMatch = content.match(/\*\*Branch:\*\*\s*(\S+)/);
const commitMatch = content.match(/\*\*Last commit:\*\*\s*(\S+)/);
const sessionRangeMatch = content.match(/\*\*Session range:\*\*\s*(\S+)/);

// Extract bullet points from the Copilot summary
const summaryStart = content.indexOf("## Copilot Session Summary");
const filesStart = content.indexOf("## Files Touched");
const summarySection = summaryStart >= 0 && filesStart > summaryStart
  ? content.slice(summaryStart, filesStart)
  : "";

const bullets = [];
const bulletRegex = /^-\s+(.+)$/gm;
let match;
while ((match = bulletRegex.exec(summarySection)) !== null) {
  bullets.push(match[1].trim());
}

console.log("");
console.log("═".repeat(60));
console.log("  ORIENT — Previous Session Summary");
console.log("═".repeat(60));
console.log("");

if (dateMatch) console.log(`  Date:     ${dateMatch[1]}`);
if (branchMatch) console.log(`  Branch:   ${branchMatch[1]}`);
if (commitMatch) console.log(`  Commit:   ${commitMatch[1]}`);
if (sessionRangeMatch) console.log(`  Range:    ${sessionRangeMatch[1]}`);
console.log(`  File:     ${files.length} continuation file(s) total`);
console.log("");

if (bullets.length > 0) {
  console.log("  Key accomplishments:");
  for (const bullet of bullets.slice(0, 20)) {
    console.log(`  • ${bullet}`);
  }
  if (bullets.length > 20) {
    console.log(`  ... and ${bullets.length - 20} more`);
  }
  console.log("");
}

// Extract Gotchas
const gotchasStart = content.indexOf("### Gotchas");
if (gotchasStart >= 0) {
  const nextSection = content.indexOf("###", gotchasStart + 10);
  const gotchasSection = nextSection >= 0
    ? content.slice(gotchasStart, nextSection)
    : content.slice(gotchasStart);

  const gotchaItems = [];
  const gotchaRegex = /^\d+\.\s+(.+)$/gm;
  let gMatch;
  while ((gMatch = gotchaRegex.exec(gotchasSection)) !== null) {
    gotchaItems.push(gMatch[1].trim());
  }

  if (gotchaItems.length > 0) {
    console.log("  ⚠ Things to watch out for:");
    for (const g of gotchaItems.slice(0, 5)) {
      console.log(`  ⚠ ${g.substring(0, 100)}${g.length > 100 ? "..." : ""}`);
    }
    console.log("");
  }
}

// Extract Next session
const nextStart = content.indexOf("### Next session");
if (nextStart >= 0) {
  const nextSectionEnd = content.indexOf("##", nextStart + 10);
  const nextSection = nextSectionEnd >= 0
    ? content.slice(nextStart, nextSectionEnd)
    : content.slice(nextStart);
  const nextLines = nextSection.split("\n")
    .filter((l) => l.trim().startsWith("- Primary:") || l.trim().startsWith("- Secondary:"));

  if (nextLines.length > 0) {
    console.log("  ▸ Next session:");
    for (const line of nextLines) {
      console.log(`    ${line.trim()}`);
    }
    console.log("");
  }
}

console.log("═".repeat(60));
console.log("  Run 'status' for full repo state.");
console.log("  The continuation file is at: " + filePath);
console.log("═".repeat(60));
console.log("");
