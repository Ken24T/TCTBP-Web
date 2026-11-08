'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('a real offline scaffold carries the same standalone Begin core and starts inspect only', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'begin scaffold '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const root = path.resolve(__dirname, '..');
  const scaffold = spawnSync(process.execPath, [path.join(root, 'scripts/tctbp-run-scaffold.js'), '--defaults', '--skip-install', '--skip-remote'],
    { cwd: directory, env, encoding: 'utf8', timeout: 60000 });
  assert.equal(scaffold.status, 0, scaffold.stderr || scaffold.stdout);
  const consumer = path.join(directory, 'my-web-app');
  const profile = JSON.parse(fs.readFileSync(path.join(consumer, '.github/TCTBP_BEGIN.json')));
  assert.equal(profile.mode, 'inspect'); assert.deepEqual(profile.repository.remotes, []);
  assert.ok(fs.existsSync(path.join(consumer, '.agents/skills/begin/SKILL.md')));
  const source = JSON.parse(fs.readFileSync(path.join(root, '.github/TCTBP_BEGIN_SOURCE.json')));
  const command = spawnSync(process.execPath, ['scripts/tctbp-run-begin.cjs', '--no-actions', '--json'],
    { cwd: consumer, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(command.status, 0, command.stderr || command.stdout);
  const result = JSON.parse(command.stdout);
  assert.equal(result.release, source.release); assert.equal(result.mode, 'inspect');
  assert.equal(result.handoffComplete, false); assert.equal(result.actions.length, 0);
});
