"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const {
  detectVersionFileFormat,
  parseTomlPackageName,
  parseTomlPackageVersion,
  parseTomlWorkspaceMembers,
  readVersionFile,
  renderCargoLockPackageVersion,
  renderCargoLockVersions,
  renderTomlPackageVersion,
  syncCargoLockVersion,
  writeVersionFile
} = require("./tctbp-profile-io");

const CARGO_TOML = [
  '[package]',
  'name = "rust-calendar"',
  'version = "0.2.0"',
  'edition = "2021"',
  '',
  '[dependencies]',
  'anyhow = "1"',
  ''
].join("\n");

test("detectVersionFileFormat recognises json, toml and plain text", () => {
  assert.equal(detectVersionFileFormat('{\n  "version": "1.2.3"\n}\n'), "json");
  assert.equal(detectVersionFileFormat('[package]\nversion = "1.2.3"\n'), "toml");
  assert.equal(detectVersionFileFormat("1.2.3\n"), "plain");
  assert.equal(detectVersionFileFormat("a very long file that is definitely not a version file\n".repeat(4)), null);
  assert.equal(detectVersionFileFormat(""), null);
  assert.equal(detectVersionFileFormat(null), null);
});

test("parseTomlPackageVersion reads the [package] version", () => {
  assert.equal(parseTomlPackageVersion(CARGO_TOML), "0.2.0");
});

test("parseTomlPackageVersion only reads the [package] table", () => {
  const content = [
    '[workspace]',
    'members = ["crates/app"]',
    '',
    '[dependencies]',
    'version = "9.9.9"',
    ''
  ].join("\n");
  assert.equal(parseTomlPackageVersion(content), null);
});

test("parseTomlPackageVersion returns null when [package] has no version", () => {
  const content = '[package]\nname = "demo"\n';
  assert.equal(parseTomlPackageVersion(content), null);
});

test("renderTomlPackageVersion replaces only the [package] version and preserves the rest", () => {
  const rendered = renderTomlPackageVersion(CARGO_TOML, "0.3.0");
  assert.ok(rendered);
  assert.equal(rendered, CARGO_TOML.replace('version = "0.2.0"', 'version = "0.3.0"'));
  assert.ok(rendered.includes('name = "rust-calendar"'));
  assert.ok(rendered.includes("anyhow = \"1\""));
});

test("renderTomlPackageVersion returns null when no [package] version exists", () => {
  assert.equal(renderTomlPackageVersion("[package]\nname = \"demo\"\n", "0.3.0"), null);
});

test("readVersionFile and writeVersionFile round-trip JSON", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-version-json-"));
  try {
    const file = path.join(root, "package.json");
    fs.writeFileSync(file, '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n', "utf8");
    assert.deepEqual(readVersionFile(file), { ok: true, format: "json", version: "1.0.0" });
    assert.deepEqual(writeVersionFile(file, "1.1.0", "1.0.0"), { ok: true, format: "json" });
    assert.equal(readVersionFile(file).version, "1.1.0");
    // Raw replacement preserves formatting (still two-space indented, no reflow).
    assert.ok(fs.readFileSync(file, "utf8").includes('"version": "1.1.0"'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readVersionFile and writeVersionFile round-trip TOML", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-version-toml-"));
  try {
    const file = path.join(root, "Cargo.toml");
    fs.writeFileSync(file, CARGO_TOML, "utf8");
    assert.deepEqual(readVersionFile(file), { ok: true, format: "toml", version: "0.2.0" });
    assert.deepEqual(writeVersionFile(file, "0.3.0"), { ok: true, format: "toml" });
    assert.equal(readVersionFile(file).version, "0.3.0");
    assert.equal(fs.readFileSync(file, "utf8"), CARGO_TOML.replace('version = "0.2.0"', 'version = "0.3.0"'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readVersionFile and writeVersionFile round-trip plain text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-version-plain-"));
  try {
    const file = path.join(root, "VERSION");
    fs.writeFileSync(file, "2.0.0\n", "utf8");
    assert.deepEqual(readVersionFile(file), { ok: true, format: "plain", version: "2.0.0" });
    assert.deepEqual(writeVersionFile(file, "2.1.0"), { ok: true, format: "plain" });
    assert.equal(fs.readFileSync(file, "utf8"), "2.1.0\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeVersionFile fails cleanly for unsupported formats", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-version-bad-"));
  try {
    const file = path.join(root, "VERSION.txt");
    fs.writeFileSync(file, "this is not a version file and is far too long to be one\n".repeat(3), "utf8");
    const result = writeVersionFile(file, "1.0.0");
    assert.equal(result.ok, false);
    assert.match(result.error, /Unsupported version file format/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseTomlPackageName reads the [package] name", () => {
  assert.equal(parseTomlPackageName(CARGO_TOML), "rust-calendar");
});

test("parseTomlPackageName returns null without a [package] name", () => {
  assert.equal(parseTomlPackageName("[package]\nversion = \"0.2.0\"\n"), null);
  assert.equal(parseTomlPackageName("[dependencies]\nname = \"x\"\n"), null);
});

const CARGO_LOCK = [
  '[[package]]',
  'name = "anyhow"',
  'version = "1.0.1"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  '',
  '[[package]]',
  'name = "rust-calendar"',
  'version = "2.4.39"',
  'dependencies = [',
  ' "anyhow",',
  ']',
  '',
  '[[package]]',
  'name = "serde"',
  'version = "1.0.2"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  ''
].join("\n");

test("renderCargoLockPackageVersion rewrites only the matching [[package]] version", () => {
  const rendered = renderCargoLockPackageVersion(CARGO_LOCK, "rust-calendar", "2.4.40");
  assert.ok(rendered);
  assert.equal(rendered, CARGO_LOCK.replace('version = "2.4.39"', 'version = "2.4.40"'));
  // Dependency versions are untouched.
  assert.ok(rendered.includes('name = "anyhow"'));
  assert.ok(rendered.includes('version = "1.0.1"'));
  assert.ok(rendered.includes('name = "serde"'));
  assert.ok(rendered.includes('version = "1.0.2"'));
});

test("renderCargoLockPackageVersion returns null for a missing package", () => {
  assert.equal(renderCargoLockPackageVersion(CARGO_LOCK, "does-not-exist", "1.0.0"), null);
});

test("syncCargoLockVersion is a no-op for non-Cargo version files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-lock-json-"));
  try {
    const file = path.join(root, "package.json");
    fs.writeFileSync(file, '{"version":"1.0.0"}\n', "utf8");
    assert.deepEqual(syncCargoLockVersion(file, "1.1.0"), { ok: true, updated: false, path: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncCargoLockVersion is a no-op when no lockfile exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-lock-none-"));
  try {
    const file = path.join(root, "Cargo.toml");
    fs.writeFileSync(file, CARGO_TOML, "utf8");
    assert.deepEqual(syncCargoLockVersion(file, "0.3.0"), { ok: true, updated: false, path: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncCargoLockVersion updates the sibling Cargo.lock in place", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-lock-sync-"));
  try {
    const toml = path.join(root, "Cargo.toml");
    const lock = path.join(root, "Cargo.lock");
    fs.writeFileSync(toml, CARGO_TOML, "utf8");
    fs.writeFileSync(lock, CARGO_LOCK, "utf8");
    const result = syncCargoLockVersion(toml, "0.3.0");
    assert.equal(result.ok, true);
    assert.equal(result.updated, true);
    assert.equal(result.path, lock);
    const synced = fs.readFileSync(lock, "utf8");
    assert.ok(synced.includes('name = "rust-calendar"'));
    assert.ok(synced.includes('version = "0.3.0"'));
    assert.ok(synced.includes('version = "1.0.1"'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── Rust workspace versioning (workspace-inherited member versions) ────────

const WORKSPACE_CARGO_TOML = [
  "[workspace]",
  'members = ["crates/alpha", "crates/beta"]',
  'resolver = "2"',
  "",
  "[workspace.package]",
  'edition = "2024"',
  'version = "0.4.4"',
  "",
  "[workspace.dependencies]",
  'anyhow = "1.0"',
  ""
].join("\n");

const MEMBER_ALPHA_TOML = ['[package]', 'name = "extractor-alpha"', 'version.workspace = true', ""].join("\n");
const MEMBER_BETA_TOML = ['[package]', 'name = "extractor-beta"', 'version.workspace = true', ""].join("\n");

const WORKSPACE_LOCK = [
  '[[package]]',
  'name = "extractor-alpha"',
  'version = "0.4.4"',
  'dependencies = [',
  ' "anyhow",',
  ']',
  "",
  '[[package]]',
  'name = "extractor-beta"',
  'version = "0.4.4"',
  'dependencies = [',
  ' "anyhow",',
  ']',
  "",
  '[[package]]',
  'name = "anyhow"',
  'version = "1.0.1"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  ""
].join("\n");

test("detectVersionFileFormat recognises a workspace root Cargo.toml", () => {
  assert.equal(detectVersionFileFormat(WORKSPACE_CARGO_TOML), "toml");
});

test("parseTomlPackageVersion falls back to [workspace.package]", () => {
  assert.equal(parseTomlPackageVersion(WORKSPACE_CARGO_TOML), "0.4.4");
});

test("parseTomlWorkspaceMembers reads the member paths", () => {
  assert.deepEqual(parseTomlWorkspaceMembers(WORKSPACE_CARGO_TOML), ["crates/alpha", "crates/beta"]);
  assert.deepEqual(parseTomlWorkspaceMembers('[package]\nname = "x"\n'), []);
});

test("renderTomlPackageVersion replaces the [workspace.package] version", () => {
  const rendered = renderTomlPackageVersion(WORKSPACE_CARGO_TOML, "0.5.0");
  assert.ok(rendered);
  assert.equal(rendered, WORKSPACE_CARGO_TOML.replace('version = "0.4.4"', 'version = "0.5.0"'));
});

test("readVersionFile reads a workspace root Cargo.toml version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-ws-read-"));
  try {
    const file = path.join(root, "Cargo.toml");
    fs.writeFileSync(file, WORKSPACE_CARGO_TOML, "utf8");
    assert.deepEqual(readVersionFile(file), { ok: true, format: "toml", version: "0.4.4" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("renderCargoLockVersions updates every member [[package]] entry", () => {
  const rendered = renderCargoLockVersions(WORKSPACE_LOCK, ["extractor-alpha", "extractor-beta"], "0.5.0");
  assert.ok(rendered);
  assert.ok(rendered.includes('name = "extractor-alpha"\nversion = "0.5.0"'));
  assert.ok(rendered.includes('name = "extractor-beta"\nversion = "0.5.0"'));
  assert.ok(rendered.includes('name = "anyhow"'));
  assert.ok(rendered.includes('version = "1.0.1"'));
  assert.equal(renderCargoLockVersions(WORKSPACE_LOCK, ["missing"], "0.5.0"), null);
});

test("syncCargoLockVersion syncs all workspace members in a lockfile", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-ws-sync-"));
  try {
    const crates = path.join(root, "crates");
    fs.mkdirSync(path.join(crates, "alpha"), { recursive: true });
    fs.mkdirSync(path.join(crates, "beta"), { recursive: true });
    fs.writeFileSync(path.join(root, "Cargo.toml"), WORKSPACE_CARGO_TOML, "utf8");
    fs.writeFileSync(path.join(crates, "alpha", "Cargo.toml"), MEMBER_ALPHA_TOML, "utf8");
    fs.writeFileSync(path.join(crates, "beta", "Cargo.toml"), MEMBER_BETA_TOML, "utf8");
    fs.writeFileSync(path.join(root, "Cargo.lock"), WORKSPACE_LOCK, "utf8");

    const result = syncCargoLockVersion(path.join(root, "Cargo.toml"), "0.5.0");
    assert.equal(result.ok, true);
    assert.equal(result.updated, true);
    const synced = fs.readFileSync(path.join(root, "Cargo.lock"), "utf8");
    assert.ok(synced.includes('name = "extractor-alpha"\nversion = "0.5.0"'));
    assert.ok(synced.includes('name = "extractor-beta"\nversion = "0.5.0"'));
    assert.ok(synced.includes('name = "anyhow"\nversion = "1.0.1"'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
