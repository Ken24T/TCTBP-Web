const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { countPhysicalLines, inspect } = require('../check-modularity.cjs');
const source = path.resolve(__dirname, '../..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'modularity-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.github'));
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const file of ['.github/development-policy.json', 'scripts/check-modularity.cjs']) {
    fs.copyFileSync(path.join(source, file), path.join(root, file));
  }
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_NO_LAZY_FETCH: '1' };
  const git = (...args) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  return { root, git,
    write(file, text) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); },
    run(...args) { return spawnSync(process.execPath, ['scripts/check-modularity.cjs', ...args], { cwd: root, encoding: 'utf8' }); },
  };
}

test('physical lines include blanks and comments without a trailing phantom line', () => {
  assert.equal(countPhysicalLines(''), 0);
  assert.equal(countPhysicalLines('a'), 1);
  assert.equal(countPhysicalLines('a\n'), 1);
  assert.equal(countPhysicalLines('a\r\n\r\n// comment\r\n'), 3);
  assert.equal(countPhysicalLines('\n'), 1);
});

test('large source, documentation, tests and styles report review without size failures', t => {
  const f = fixture(t);
  for (const file of ['source.py', 'guide.md', 'tests/fixture.js', 'style.scss']) f.write(file, 'line\n'.repeat(2600));
  const result = f.run('--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  for (const file of ['source.py', 'guide.md', 'tests/fixture.js', 'style.scss']) {
    assert.equal(report.files.find(x => x.path === file).signal, 'design-review');
  }
  assert.equal(report.files.find(x => x.path === 'guide.md').kind, 'documentation');
  assert.equal(report.files.find(x => x.path === 'tests/fixture.js').kind, 'test');
});

test('300 and 600 are review thresholds with no forced split', t => {
  const f = fixture(t);
  for (const count of [299, 300, 599, 600]) f.write(`file-${count}.js`, '\n'.repeat(count));
  const report = inspect(f.root);
  assert.deepEqual(report.files.filter(x => x.path.startsWith('file-')).map(x => x.signal),
    ['none', 'structure-review', 'structure-review', 'design-review']);
});

test('changed inspection preserves index, heads and saved work, including staged and new files', t => {
  const f = fixture(t);
  f.write('base.js', 'baseline\n'); f.write('delete.js', 'keep in Git\n');
  f.git('add', '-A'); f.git('commit', '-qm', 'fixture');
  f.write('base.js', 'staged\n'); f.git('add', 'base.js'); f.write('base.js', 'saved after staging\n');
  f.write('new.md', 'new draft\n'); fs.unlinkSync(path.join(f.root, 'delete.js'));
  const before = [f.git('rev-parse', 'HEAD'), fs.readFileSync(path.join(f.root, '.git/index')), f.git('diff', '--binary', 'HEAD')];
  const report = inspect(f.root, { changed: true });
  assert.deepEqual(report.files.map(x => x.path), ['base.js', 'new.md']);
  assert.deepEqual([f.git('rev-parse', 'HEAD'), fs.readFileSync(path.join(f.root, '.git/index')), f.git('diff', '--binary', 'HEAD')], before);
  assert.equal(fs.readFileSync(path.join(f.root, 'base.js'), 'utf8'), 'saved after staging\n');
});

test('changed inspection supports an unborn repository', t => {
  const f = fixture(t); f.write('first.js', 'initial\n'); f.git('add', 'first.js');
  assert.ok(inspect(f.root, { changed: true }).files.some(x => x.path === 'first.js'));
});

test('ignored and generated outputs are excluded visibly; symlinks are not followed', t => {
  const f = fixture(t);
  f.write('.gitignore', 'ignored.js\n'); f.write('ignored.js', 'large\n'.repeat(900));
  f.write('generated.js', '// @generated\n' + 'large\n'.repeat(900));
  fs.symlinkSync('/etc/hosts', path.join(f.root, 'linked.txt'));
  const report = inspect(f.root);
  assert.ok(!report.files.some(x => ['ignored.js', 'generated.js', 'linked.txt'].includes(x.path)));
  assert.deepEqual(report.excluded.map(x => x.reason).sort(), ['marked generated', 'symlink']);
});

test('missing or invalid policy and unsupported mutation options remain failures', t => {
  const f = fixture(t);
  assert.notEqual(f.run('--update-baseline').status, 0);
  const p = path.join(f.root, '.github/development-policy.json');
  const original = fs.readFileSync(p, 'utf8');
  const policy = JSON.parse(original); policy.reporting.failOnSize = true; fs.writeFileSync(p, JSON.stringify(policy));
  assert.notEqual(f.run('--json').status, 0);
  fs.unlinkSync(p); assert.notEqual(f.run('--json').status, 0);
});

test('the same reporter runs inside an ESM repository', t => {
  const f = fixture(t); f.write('package.json', '{"type":"module"}\n');
  assert.equal(f.run('--json').status, 0);
});

test('extensionless interpreter scripts receive the same review signals', t => {
  const f = fixture(t);
  f.write('scripts/fleet-example', '#!/usr/bin/env python3\n' + 'line\n'.repeat(700));
  f.git('add', 'scripts/fleet-example');
  f.write('home/.local/bin/example', '#!/bin/bash\n' + 'line\n'.repeat(700));
  const report = inspect(f.root);
  for (const name of ['scripts/fleet-example', 'home/.local/bin/example']) {
    assert.equal(report.files.find(x => x.path === name).signal, 'design-review');
  }
});

test('malformed exclusions and missing version metadata are inspection errors', t => {
  const f = fixture(t); const p = path.join(f.root, '.github/development-policy.json');
  const original = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const change of [p => { p.exclusions.directories = [{}]; }, p => { p.exclusions.files = [null]; },
    p => { p.exclusions.directories = ['../outside']; }, p => { delete p.version; }, p => { p.document = '/outside'; }]) {
    const value = structuredClone(original); change(value); fs.writeFileSync(p, JSON.stringify(value));
    assert.notEqual(f.run('--json').status, 0);
  }
});

test('ordinary mentions of generation and marker strings are not exclusions', t => {
  const f = fixture(t);
  f.write('guide.md', 'This explains automatically generated reports.\n' + 'line\n'.repeat(650));
  f.write('source.js', "const note = '@generated';\n" + 'line\n'.repeat(650));
  const report = inspect(f.root);
  assert.equal(report.files.find(x => x.path === 'guide.md').signal, 'design-review');
  assert.equal(report.files.find(x => x.path === 'source.js').signal, 'design-review');
});

test('inherited Git environment cannot redirect fixture or reporter inspection', t => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'modularity-outer-'));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  const index = path.join(outer, 'index'); fs.writeFileSync(index, 'external sentinel');
  const keys = ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE'];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    process.env.GIT_INDEX_FILE = index; process.env.GIT_DIR = path.join(outer, 'not-a-repo'); process.env.GIT_WORK_TREE = outer;
    const f = fixture(t); f.write('source.js', 'saved\n'); f.git('add', '-A'); f.git('commit', '-qm', 'fixture');
    assert.equal(f.run('--json').status, 0);
    assert.equal(fs.readFileSync(index, 'utf8'), 'external sentinel');
  } finally {
    for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  }
});
