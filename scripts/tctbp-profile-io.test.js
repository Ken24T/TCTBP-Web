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
  readVersionFile,
  renderCargoLockPackageVersion,
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
