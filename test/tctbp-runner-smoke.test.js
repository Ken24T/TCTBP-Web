const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  return result;
}

function createRunnerFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-runner-"));
  const repo = path.join(base, "repo");
  const remote = path.join(base, "origin.git");
  fs.mkdirSync(path.join(repo, ".github"), { recursive: true });

  const policy = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".github", "TCTBP.json"), "utf8")
  );
  policy.governance.templateMode = false;
  policy.branchModel = {
    strategy: "staged",
    workingBranch: "development",
    stagingBranch: "staging",
    productionBranch: "main",
    promoteEnabled: true,
    deployEnabled: true
  };

  fs.writeFileSync(
    path.join(repo, ".github", "TCTBP.json"),
    `${JSON.stringify(policy, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify(
      {
        name: "runner-fixture",
        version: "0.1.0",
        scripts: { test: "node -e \"process.exit(0)\"" }
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(repo, "VERSION"), "0.1.0\n");

  run("git", ["init", "-b", "main"], { cwd: repo });
  run("git", ["config", "user.name", "TCTBP Test"], { cwd: repo });
  run("git", ["config", "user.email", "tctbp-test@example.invalid"], {
    cwd: repo
  });
  run("git", ["add", "-A"], { cwd: repo });
  run("git", ["commit", "-m", "fixture"], { cwd: repo });
  run("git", ["branch", "staging"], { cwd: repo });
  run("git", ["switch", "-c", "development"], { cwd: repo });

  run("git", ["init", "--bare", remote]);
  run("git", ["remote", "add", "origin", remote], { cwd: repo });
  run("git", ["push", "-u", "origin", "main", "staging", "development"], {
    cwd: repo
  });

  return {
    repo,
    remote,
    env: { ...process.env, TCTBP_REPO_ROOT: repo }
  };
}

test("all runner sources pass node syntax checks", () => {
  const scripts = fs
    .readdirSync(path.join(projectRoot, "scripts"))
    .filter((name) => name.endsWith(".js"));

  for (const script of scripts) {
    run(process.execPath, [
      "--check",
      path.join(projectRoot, "scripts", script)
    ]);
  }
});

test("promote and deploy dry-run entry paths load their dependencies", () => {
  const fixture = createRunnerFixture();

  run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-promote.js"),
      "staging",
      "--dry-run",
      "--no-docs-impact",
      "runner smoke test"
    ],
    fixture
  );

  run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-deploy.js"),
      "dev",
      "--dry-run",
      "--no-docs-impact",
      "runner smoke test"
    ],
    fixture
  );
});

test("status and resume use the staged branch model", () => {
  const fixture = createRunnerFixture();
  const status = run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-status.js"),
      "--no-fetch"
    ],
    fixture
  );
  const resume = run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-resume.js"),
      "--dry-run"
    ],
    fixture
  );

  assert.match(status.stdout, /staging/);
  assert.match(resume.stdout, /staging/);
  assert.doesNotMatch(resume.stdout, /\breview\b/);
});

test("status JSON is pure, schema-versioned, and does not fetch", () => {
  const fixture = createRunnerFixture();
  fs.rmSync(fixture.remote, { recursive: true, force: true });

  const result = run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-status.js"),
      "--json",
      "--no-fetch"
    ],
    fixture
  );
  const document = JSON.parse(result.stdout);

  assert.equal(document.contract.major, 1);
  assert.equal(document.observation.fetchPerformed, false);
  assert.equal(document.observation.branchModel.strategy, "staged");
  assert.deepEqual(
    document.observation.branchModel.promotionTargets,
    ["staging", "production"]
  );
  assert.doesNotMatch(result.stdout, /\| Origin \| Local \|/);
});

test("human status output remains the default", () => {
  const fixture = createRunnerFixture();
  const result = run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-status.js"),
      "--no-fetch"
    ],
    fixture
  );

  assert.match(result.stdout, /\| Origin \| Local \| Status \| Action\(s\) \|/);
});

test("long-lived scaffold creates development, review, and main", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tctbp-scaffold-"));
  const target = path.join(base, "adviser-fixture");

  run(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "tctbp-run-scaffold.js"),
      "--name",
      "adviser-fixture",
      "--target",
      target,
      "--working",
      "development",
      "--strategy",
      "long-lived",
      "--framework",
      "none",
      "--deploy",
      "none yet",
      "--test",
      "none",
      "--skip-install",
      "--skip-remote"
    ],
    { cwd: projectRoot }
  );

  const branches = run(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    { cwd: target }
  ).stdout
    .trim()
    .split(/\r?\n/)
    .sort();
  const profile = JSON.parse(
    fs.readFileSync(path.join(target, ".github", "TCTBP.json"), "utf8")
  );

  assert.deepEqual(branches, ["development", "main", "review"]);
  assert.equal(
    profile.branchModel.strategy,
    "long-lived-environment-branches"
  );
  assert.equal(profile.branchModel.reviewBranch, "review");
  assert.equal(profile.schemaVersion, 11);
  assert.equal(profile.adviserContract.major, 1);
  assert.equal(
    fs.existsSync(path.join(target, "scripts", "tctbp-branch-model.js")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(target, "scripts", "tctbp-status-model.js")),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        target,
        "schemas",
        "tctbp-adviser-inspection-v1.schema.json"
      )
    ),
    true
  );
});
