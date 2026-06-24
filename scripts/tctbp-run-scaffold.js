#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const readline = require("readline");

const SCAFFOLD_REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(SCAFFOLD_REPO_ROOT, "templates");
const SCRIPTS_DIR = path.join(SCAFFOLD_REPO_ROOT, "scripts");
const GITHUB_DIR = path.join(SCAFFOLD_REPO_ROOT, ".github");

const RUNNER_FILES = [
  "tctbp-runtime.js",
  "tctbp-core.js",
  "tctbp-git-ops.js",
  "tctbp-profile-io.js",
  "tctbp-output.js",
  "tctbp-gates.js",
  "tctbp-pretool-hook.js",
  "tctbp-run-status.js",
  "tctbp-run-checkpoint.js",
  "tctbp-run-publish.js",
  "tctbp-run-handover.js",
  "tctbp-run-resume.js",
  "tctbp-run-ship.js",
  "tctbp-run-branch.js",
  "tctbp-run-promote.js",
  "tctbp-run-deploy.js",
  "tctbp-run-abort.js",
  "tctbp-run-gate.js",
  "tctbp-run-version.js",
  "tctbp-run-rollback.js",
  "tctbp-run-runtime-advisory.js",
  "tctbp-run-orient.js",
  "tctbp-run-workflow.js",
  "tctbp-status-report.js",
  "tctbp-scaffold-cli.js",
  "tctbp-scaffold-profile.js",
];

const GITHUB_FILES = [
  "agents/TCTBP.agent.md",
  "TCTBP Agent.md",
  "TCTBP Cheatsheet.md",
  "hooks/tctbp-safety.json",
];

const PROMPT_FILES = [
  "Install TCTBP Agent Infrastructure Into Another Repository.prompt.md",
  "Scaffold New TCTBP-Web Project.prompt.md",
];

const options = parseArgs(process.argv.slice(2));

if (options.list) {
  printUsage(0);
}

main(options).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(cliOptions) {
  const answers = cliOptions.defaults
    ? getDefaultAnswers()
    : await interview(cliOptions);

  validateAnswers(answers);

  if (cliOptions.dryRun) {
    printDryRun(answers);
    return;
  }

  logSection("Scaffold");
  logItem("Project", answers.projectName);
  logItem("Target", answers.targetPath);
  logItem("Working branch", answers.workingBranch);
  logItem("Strategy", answers.branchStrategy);
  logItem("Framework", answers.framework);
  logItem("Deploy target", answers.deployTarget);
  logItem("Test framework", answers.testFramework);

  createDirectory(answers.targetPath);
  writeProjectSkeleton(answers);
  copyTctbpRuntime(answers.targetPath);
  generateProfile(answers);
  copyPrompts(answers.targetPath);
  gitInit(answers);
  createBranchStructure(answers);
  await installDependencies(answers, cliOptions);
  await setupGitRemote(answers, cliOptions);
  smokeTest(answers);
  printSummary(answers, cliOptions);
}

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

async function interview(cliOptions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  console.log("TCTBP-Web Project Scaffold\n");

  const projectName = cliOptions.name || await ask("Project name: ");
  const targetPath = cliOptions.target || await ask("Target directory (absolute path): ");
  const workingBranch = cliOptions.working || await ask(`Working branch name [development]: `) || "development";
  const branchStrategy = cliOptions.strategy || await ask(`Branch strategy: staged (development→staging→main) or simple (main only) [staged]: `) || "staged";
  const framework = cliOptions.framework || await ask(`Framework: vite (React+TS), or none [vite]: `) || "vite";
  const deployTarget = cliOptions.deploy || await ask(`Deploy target: Vercel, Netlify, Cloudflare Pages, Docker, or none yet [none yet]: `) || "none yet";
  const testFramework = cliOptions.test || await ask(`Test framework: vitest, jest, or none [vitest]: `) || "vitest";

  rl.close();

  return {
    projectName: projectName.trim(),
    targetPath: path.resolve(targetPath.trim()),
    workingBranch: workingBranch.trim() || "development",
    branchStrategy: branchStrategy.trim() || "staged",
    framework: framework.trim() || "vite",
    deployTarget: deployTarget.trim() || "none yet",
    testFramework: testFramework.trim() || "vitest",
  };
}

function getDefaultAnswers() {
  return {
    projectName: "my-web-app",
    targetPath: path.resolve(process.cwd(), "my-web-app"),
    workingBranch: "development",
    branchStrategy: "staged",
    framework: "vite",
    deployTarget: "none yet",
    testFramework: "vitest",
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateAnswers(answers) {
  if (!answers.projectName || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(answers.projectName)) {
    fail("Project name must be a valid npm package name (lowercase, hyphens, no spaces, start and end with alphanumeric).");
  }

  if (!answers.targetPath || !path.isAbsolute(answers.targetPath)) {
    fail("Target path must be an absolute path.");
  }

  if (fs.existsSync(answers.targetPath)) {
    const contents = fs.readdirSync(answers.targetPath);
    if (contents.length > 0) {
      fail(`Target directory is not empty (${contents.length} item(s)). Use reconcile-tctbp for existing projects, or choose an empty directory.`);
    }
  }

  if (answers.workingBranch === "main" || answers.workingBranch === "staging") {
    fail(`Working branch cannot be '${answers.workingBranch}'. Choose a different name.`);
  }

  if (!["staged", "simple"].includes(answers.branchStrategy)) {
    fail("Branch strategy must be 'staged' or 'simple'.");
  }

  if (!["vite", "none"].includes(answers.framework)) {
    fail("Framework must be 'vite' or 'none'.");
  }

  const validDeployTargets = ["vercel", "netlify", "cloudflare pages", "docker", "none yet"];
  if (!validDeployTargets.includes(answers.deployTarget.toLowerCase())) {
    fail(`Deploy target must be one of: ${validDeployTargets.join(", ")}.`);
  }

  if (!["vitest", "jest", "none"].includes(answers.testFramework)) {
    fail("Test framework must be 'vitest', 'jest', or 'none'.");
  }
}

// ---------------------------------------------------------------------------
// Directory creation
// ---------------------------------------------------------------------------

function createDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  fs.mkdirSync(path.join(targetPath, "src"), { recursive: true });
  fs.mkdirSync(path.join(targetPath, ".github", "agents"), { recursive: true });
  fs.mkdirSync(path.join(targetPath, ".github", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(targetPath, ".github", "prompts"), { recursive: true });
  fs.mkdirSync(path.join(targetPath, "scripts"), { recursive: true });
  console.log("Created project directory structure.");
}

// ---------------------------------------------------------------------------
// Template substitution
// ---------------------------------------------------------------------------

function substitute(template, answers) {
  const isStaged = answers.branchStrategy === "staged";
  const hasVitest = answers.testFramework === "vitest";
  const hasJest = answers.testFramework === "jest";
  const hasTests = hasVitest || hasJest;

  let testScripts = "";
  if (hasVitest) {
    testScripts = `"test": "vitest run",\n    "test:watch": "vitest",\n    `;
  } else if (hasJest) {
    testScripts = `"test": "jest",\n    "test:watch": "jest --watch",\n    `;
  }

  let testDevDeps = "";
  if (hasVitest) {
    testDevDeps = `"vitest": "^1.0.0",\n    `;
  } else if (hasJest) {
    testDevDeps = `"jest": "^29.0.0",\n    "@types/jest": "^29.0.0",\n    "ts-jest": "^29.0.0",\n    `;
  }

  let branchDiagram = "";
  let branchStrategyDesc = "";
  if (isStaged) {
    branchStrategyDesc = "staged branch model";
    branchDiagram = `\`\`\`\n${answers.workingBranch} ──promote staging──▶ staging ──promote production──▶ main\n     │                                  │                                  │\n     ▼                                  ▼                                  ▼\n deploy dev                      deploy staging                    ship → deploy prod\n\`\`\``;
  } else {
    branchStrategyDesc = "simple branch model";
    branchDiagram = "```\nmain (production)\n```";
  }

  let scriptList = "";
  if (hasTests) scriptList += `- \`npm run test\` — Run tests (${answers.testFramework})\n`;
  if (hasTests) scriptList += `- \`npm run test:watch\` — Run tests in watch mode\n`;

  const hasVite = answers.framework === "vite";
  let frameworkScripts = "";
  let frameworkDeps = "";
  let frameworkDevDeps = "";
  let frameworkGuidance = "";
  let quickStart = "";

  if (hasVite) {
    frameworkScripts = `"dev": "vite",\n    "build": "tsc -b && vite build",\n    "preview": "vite preview",\n    `;
    frameworkDeps = `"react": "^19.0.0",\n    "react-dom": "^19.0.0"\n    `;
    frameworkDevDeps = `"vite": "^6.0.0",\n    "@vitejs/plugin-react": "^4.0.0",\n    "@types/react": "^19.0.0",\n    "@types/react-dom": "^19.0.0",\n    `;
    quickStart = "Run `npm run dev` to start the Vite dev server. ";
    quickStart += "Run `npm run typecheck` to validate TypeScript. ";
    if (hasTests) quickStart += "Run `npm run test` to run the test suite.";
    frameworkGuidance = `## Framework: Vite + React + TypeScript

- **Dev server:** \`npm run dev\` (Vite on port 5173)
- **Build:** \`npm run build\` (TypeScript → Vite production bundle)
- **Component pattern:** One component per file in \`src/\`. Use function components with hooks.
- **Styling:** CSS imports. Add Tailwind or CSS modules as needed.
- **Routing:** Add \`react-router-dom\` when routes are needed.
- **State:** Use React hooks (\`useState\`, \`useReducer\`). Add Zustand or Context for shared state.`;
  } else {
    quickStart = "Run `npm run typecheck` to validate TypeScript. ";
    if (hasTests) quickStart += "Run `npm run test` to run the test suite. ";
    frameworkGuidance = "No framework selected yet. Update this section when you add React, Next.js, Vue, Svelte, or another framework.";
  }

  let deployGuidance = "";
  if (hasVite) {
    if (answers.deployTarget.toLowerCase() === "vercel") {
      deployGuidance = "Deploy target is Vercel with Vite. Use the Vercel adapter or static export. Configure `vite.config.ts` for serverless if using SSR.";
    } else if (answers.deployTarget.toLowerCase() === "netlify") {
      deployGuidance = "Deploy target is Netlify with Vite. Use \`npm run build\` as the build command and \`dist/\` as the publish directory.";
    } else if (answers.deployTarget.toLowerCase() === "cloudflare pages") {
      deployGuidance = "Deploy target is Cloudflare Pages with Vite. Set build command to \`npm run build\` and output directory to \`dist/\`.";
    } else if (answers.deployTarget.toLowerCase() === "docker") {
      deployGuidance = "Deploy target is Docker with Vite. Use multi-stage builds — Vite for the static build, nginx for serving.";
    }
  }

  let branchModelNote = "";
  if (isStaged) {
    branchModelNote = `## Branch Model

This project uses the **staged branch model**: \`${answers.workingBranch}\` → \`staging\` → \`main\`.

- \`${answers.workingBranch}\` — Active development. Checkpoint and publish freely.
- \`staging\` — Field-testing and review. Promote from \`${answers.workingBranch}\` before deploying staging.
- \`main\` — Production. Promote from \`staging\`, then ship and deploy.

Never commit directly to \`staging\` or \`main\`. Always promote through the chain.`;
  } else {
    branchModelNote = `## Branch Model

This project uses the **simple branch model**: \`main\` only. All work happens on \`main\` or short-lived feature branches that merge back into \`main\`.`;
  }

  let result = template;
  result = result.replace(/\{\{PROJECT_NAME\}\}/g, answers.projectName);
  result = result.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, `A web application built with the TCTBP-Web workflow.`);
  result = result.replace(/\{\{TEST_SCRIPTS\}\}/g, testScripts);
  result = result.replace(/\{\{TEST_DEV_DEPENDENCIES\}\}/g, testDevDeps);
  result = result.replace(/\{\{QUICK_START_STEPS\}\}/g, quickStart);
  result = result.replace(/\{\{BRANCH_STRATEGY_DESCRIPTION\}\}/g, branchStrategyDesc);
  result = result.replace(/\{\{BRANCH_DIAGRAM\}\}/g, branchDiagram);
  result = result.replace(/\{\{SCRIPT_LIST\}\}/g, scriptList);
  result = result.replace(/\{\{FRAMEWORK_GUIDANCE\}\}/g, frameworkGuidance);
  result = result.replace(/\{\{DEPLOY_GUIDANCE\}\}/g, deployGuidance);
  result = result.replace(/\{\{BRANCH_MODEL_NOTE\}\}/g, branchModelNote);
  result = result.replace(/\{\{TEST_FRAMEWORK\}\}/g, hasTests ? answers.testFramework : "none");
  result = result.replace(/\{\{WORKING_BRANCH\}\}/g, answers.workingBranch);
  result = result.replace(/\{\{DEPLOY_TARGET\}\}/g, answers.deployTarget);
  result = result.replace(/\{\{FRAMEWORK_SCRIPTS\}\}/g, frameworkScripts);
  result = result.replace(/\{\{FRAMEWORK_DEPS\}\}/g, frameworkDeps);
  result = result.replace(/\{\{FRAMEWORK_DEV_DEPS\}\}/g, frameworkDevDeps);

  return result;
}

// ---------------------------------------------------------------------------
// Write project skeleton
// ---------------------------------------------------------------------------

function writeProjectSkeleton(answers) {
  const tpl = (name) => path.join(TEMPLATES_DIR, name);

  writeTemplate(tpl("package.json.template"), path.join(answers.targetPath, "package.json"), answers);
  writeTemplate(tpl("tsconfig.json.template"), path.join(answers.targetPath, "tsconfig.json"), answers);
  writeTemplate(tpl(".gitignore.template"), path.join(answers.targetPath, ".gitignore"), answers);
  writeTemplate(tpl("README.md.template"), path.join(answers.targetPath, "README.md"), answers);
  writeTemplate(tpl("copilot-instructions.md.template"), path.join(answers.targetPath, ".github", "copilot-instructions.md"), answers);

  if (answers.framework === "vite") {
    writeViteTemplates(answers);
  }

  if (answers.testFramework === "vitest") {
    writeTemplate(tpl("vitest.config.ts.template"), path.join(answers.targetPath, "vitest.config.ts"), answers);
    writeTemplate(tpl("src/placeholder.test.ts.template"), path.join(answers.targetPath, "src", "placeholder.test.ts"), answers);
  }

  console.log("Wrote project skeleton files.");
}

function writeViteTemplates(answers) {
  const viteTpl = (name) => path.join(TEMPLATES_DIR, "vite", name);
  writeTemplate(viteTpl("index.html.template"), path.join(answers.targetPath, "index.html"), answers);
  writeTemplate(viteTpl("vite.config.ts.template"), path.join(answers.targetPath, "vite.config.ts"), answers);
  writeTemplate(viteTpl("src/main.tsx.template"), path.join(answers.targetPath, "src", "main.tsx"), answers);
  writeTemplate(viteTpl("src/App.tsx.template"), path.join(answers.targetPath, "src", "App.tsx"), answers);
  writeTemplate(viteTpl("src/vite-env.d.ts.template"), path.join(answers.targetPath, "src", "vite-env.d.ts"), answers);
  // Remove the bare-TS placeholder test — Vite projects don't need it
  const placeholderTest = path.join(answers.targetPath, "src", "placeholder.test.ts");
  if (fs.existsSync(placeholderTest)) {
    fs.unlinkSync(placeholderTest);
  }
}

function writeTemplate(templatePath, targetPath, answers) {
  if (!fs.existsSync(templatePath)) {
    console.log(`Skipping missing template: ${templatePath}`);
    return;
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const content = substitute(template, answers);
  fs.writeFileSync(targetPath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Copy TCTBP-Web runtime
// ---------------------------------------------------------------------------

function copyTctbpRuntime(targetPath) {
  const targetScripts = path.join(targetPath, "scripts");
  for (const file of RUNNER_FILES) {
    const src = path.join(SCRIPTS_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetScripts, file));
    }
  }

  const targetGithub = path.join(targetPath, ".github");
  for (const file of GITHUB_FILES) {
    const src = path.join(GITHUB_DIR, file);
    const dst = path.join(targetGithub, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }

  console.log("Copied TCTBP-Web runtime surface.");
}

function copyPrompts(targetPath) {
  const targetPrompts = path.join(targetPath, ".github", "prompts");
  for (const file of PROMPT_FILES) {
    const src = path.join(GITHUB_DIR, "prompts", file);
    const dst = path.join(targetPrompts, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    } else {
      console.log(`Prompt file not yet available, skipping: ${file}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Generate TCTBP.json profile
// ---------------------------------------------------------------------------

function generateProfile(answers) {
  const isStaged = answers.branchStrategy === "staged";
  const hasTests = answers.testFramework !== "none";
  const hasVite = answers.framework === "vite";
  const deployTarget = answers.deployTarget.toLowerCase();

  const profile = {
    schemaVersion: 10,
    governance: {
      sourceOfTruth: "TCTBP.json",
      fallbackDocument: "TCTBP Agent.md",
      templateMode: false,
      templateInstructions: `This profile was generated by TCTBP-Web scaffold for ${answers.projectName}. Update commands and deploy targets as the project grows.`,
    },
    project: {
      name: answers.projectName,
      description: `A web application built with the TCTBP-Web workflow.`,
      defaultBranch: "main",
      packageManager: "npm",
      versionFiles: ["package.json"],
      changelogFormat: "keep-a-changelog",
      locale: "en-US",
    },
    branchModel: isStaged
      ? {
          strategy: "staged",
          workingBranch: answers.workingBranch,
          stagingBranch: "staging",
          productionBranch: "main",
          promoteEnabled: true,
          deployStagingEnabled: true,
        }
      : {
          strategy: "simple",
          productionBranch: "main",
          promoteEnabled: false,
          deployStagingEnabled: false,
        },
    profile: {
      runtimeCwd: ".",
      commands: {
        format: null,
        test: hasTests ? "npm run test" : null,
        lint: null,
        build: hasVite ? "npm run build" : null,
        releaseBuild: null,
      },
      qualityGates: {
        requireZeroProblems: true,
        requireTestsBeforeShip: hasTests,
        requireLintBeforeShip: false,
        requireBuildBeforeShip: hasVite,
      },
      versioning: {
        sourceOfTruth: "package.json",
        tagFormat: "v{version}",
        formatAfterBump: false,
      },
      devServer: {
        port: hasVite ? 5173 : null,
        label: hasVite ? "Vite dev server" : null,
      },
      developmentPolicy: {
        maxFileLines: {
          softCeiling: 250,
          warningThreshold: 400,
          hardSplit: 600,
        },
        modularity: {
          preferModularFiles: true,
          extractAtFunctionGroupSize: 3,
          maxImportsPerModule: 8,
        },
        functionRules: {
          maxLines: 40,
          preferPure: true,
          noAnyInExportedSignatures: true,
        },
      },
    },
    activation: {
      triggers: [
        "ship", "ship please", "shipping", "prepare release",
        "checkpoint", "checkpoint please",
        "publish", "publish please",
        "promote", "promote please", "promote staging", "promote staging please",
        "promote production", "promote production please", "promote prod", "promote prod please",
        "deploy", "deploy please", "deploy dev", "deploy dev please",
        "deploy development", "deploy development please",
        "deploy staging", "deploy staging please",
        "deploy prod", "deploy prod please", "deploy production", "deploy production please",
        "handover", "handover please", "handover local", "handover local please",
        "resume", "resume please", "orient", "orient please",
        "status", "status please", "abort",
        "run tests", "run lint", "run build", "gate test", "gate lint", "gate build",
        "version status", "version check",
        "rollback", "revert last checkpoint",
      ],
      caseInsensitive: true,
    },
    deploy: {
      enabled: deployTarget !== "none yet",
      targets: {},
    },
    codeLossPrevention: {
      enabled: true,
      safetyTagsEnabled: true,
      mergeDeletionAudit: {
        enabled: true,
        warnThreshold: { files: 1, lines: 500 },
        stopThreshold: { files: 5, lines: 500 },
        hardStopThreshold: { files: 20, lines: 2000 },
      },
      prePushNetDeletionCheck: { enabled: true, mode: "warn" },
    },
    versioning: {
      scheme: "semver",
      patchEveryShip: true,
      patchEveryShipForDocsInfrastructureOnly: true,
      minorOnFirstShipOfBranch: true,
      minorBranchPrefixes: ["slice/", "feature/"],
      majorExplicitOnly: true,
    },
    tagging: {
      policy: "everyCommit",
      skipWhenNoBump: true,
      format: "v{version}",
    },
  };

  // Populate deploy targets if a deploy target was selected
  if (deployTarget !== "none yet") {
    profile.deploy.targets = generateDeployTargets(answers);
  }

  const profilePath = path.join(answers.targetPath, ".github", "TCTBP.json");
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + "\n", "utf8");
  console.log("Generated TCTBP.json profile.");
}

function generateDeployTargets(answers) {
  const target = answers.deployTarget.toLowerCase();
  const baseTargets = {
    dev: {
      aliases: ["development"],
      expectedBranch: answers.workingBranch,
      description: `Deploy ${answers.workingBranch} to the development environment.`,
      preDeploySyncStrategy: "commit-and-publish-current-branch-when-needed",
      allowCommitBeforeDeploy: true,
      allowPushBeforeDeploy: true,
      requireCleanTreeBeforeDeployAction: false,
      deployCommand: null,
      comment: `Configure the deployCommand for your ${target} development target.`,
    },
    staging: {
      aliases: [],
      expectedBranch: "staging",
      description: "Deploy staging to the staging environment.",
      preDeploySyncStrategy: "push-clean-branch-when-needed",
      allowCommitBeforeDeploy: false,
      allowPushBeforeDeploy: true,
      requireCleanTreeBeforeDeployAction: true,
      deployCommand: null,
      comment: `Configure the deployCommand for your ${target} staging target.`,
    },
    production: {
      aliases: ["prod"],
      expectedBranch: "main",
      description: "Deploy main to the production environment.",
      preDeploySyncStrategy: "require-already-published-shipped-branch",
      requireCleanTreeBeforeDeployAction: true,
      requireSyncedBranchBeforeDeployAction: true,
      deployCommand: null,
      comment: `Configure the deployCommand for your ${target} production target.`,
    },
  };

  if (answers.branchStrategy === "simple") {
    delete baseTargets.dev;
    delete baseTargets.staging;
  }

  return baseTargets;
}

// ---------------------------------------------------------------------------
// Git init and branch structure
// ---------------------------------------------------------------------------

function gitInit(answers) {
  runIn(answers.targetPath, "git", ["init"]);
  runIn(answers.targetPath, "git", ["branch", "-m", "main"]);
  runIn(answers.targetPath, "git", ["add", "-A"]);
  runIn(answers.targetPath, "git", ["commit", "-m", "chore: initial TCTBP-Web scaffold"]);
  console.log("Initialized git repository with scaffold commit.");
}

function createBranchStructure(answers) {
  if (answers.branchStrategy === "staged") {
    runIn(answers.targetPath, "git", ["branch", "staging"]);
    runIn(answers.targetPath, "git", ["checkout", "-b", answers.workingBranch]);
    console.log(`Created branch structure: main, staging, ${answers.workingBranch} (current).`);
  } else {
    console.log("Simple strategy: staying on main.");
  }
}

// ── Dependency installation ─────────────────────────────────────────────────

async function installDependencies(answers, cliOptions) {
  if (cliOptions.skipInstall) {
    console.log("Skipping npm install (--skip-install).");
    return;
  }

  const hasDeps = answers.testFramework !== "none";
  if (!hasDeps) {
    console.log("No dependencies to install (test framework is none).");
    return;
  }

  console.log("Installing dependencies...");
  const result = spawnSync("npm", ["install"], {
    cwd: answers.targetPath,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.log(`  ✗ npm install failed: ${result.error.message}`);
    console.log("  Run 'npm install' manually in the project directory.");
    return;
  }

  if (result.status !== 0) {
    console.log(`  ✗ npm install exited with code ${result.status}`);
    console.log("  Run 'npm install' manually in the project directory.");
    return;
  }

  console.log("  ✓ Dependencies installed");
}

// ── Git remote setup ────────────────────────────────────────────────────────

async function setupGitRemote(answers, cliOptions) {
  if (cliOptions.skipRemote) {
    return;
  }

  const branchNames = answers.branchStrategy === "staged"
    ? [answers.workingBranch, "staging", "main"]
    : ["main"];

  if (cliOptions.remote) {
    setRemote(answers.targetPath, cliOptions.remote, branchNames);
    cliOptions.remoteWasSet = true;
    return;
  }

  if (cliOptions.defaults) {
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

  const remoteUrl = await ask("GitHub remote URL (or press Enter to skip): ");
  rl.close();

  if (remoteUrl.trim()) {
    setRemote(answers.targetPath, remoteUrl.trim(), branchNames);
    cliOptions.remote = remoteUrl.trim();
    cliOptions.remoteWasSet = true;
  }
}

function setRemote(targetPath, url, branchNames) {
  console.log(`Setting git remote origin → ${url}`);
  const result = spawnSync("git", ["remote", "add", "origin", url], {
    cwd: targetPath,
    stdio: "inherit"
  });

  if (result.error || result.status !== 0) {
    console.log("  ✗ Failed to set git remote. Add it manually: git remote add origin <url>");
    return;
  }

  console.log("  ✓ Git remote origin set");

  // Push all branches to origin
  console.log("Pushing initial scaffold to origin...");
  const pushResult = spawnSync("git", ["push", "-u", "origin", ...branchNames], {
    cwd: targetPath,
    stdio: "inherit"
  });

  if (pushResult.error || pushResult.status !== 0) {
    console.log("  ✗ Push failed. Push manually: git push -u origin " + branchNames.join(" "));
  } else {
    console.log("  ✓ Initial scaffold pushed to origin");
  }
}

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

function smokeTest(answers) {
  console.log("Running smoke tests...");

  const statusResult = spawnSync("node", ["scripts/tctbp-run-status.js", "--no-fetch"], {
    cwd: answers.targetPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (statusResult.status === 0) {
    console.log("  ✓ status runner works");
  } else {
    console.log(`  ✗ status runner failed (exit ${statusResult.status})`);
  }

  const gateResult = spawnSync("node", ["scripts/tctbp-run-gate.js", "test"], {
    cwd: answers.targetPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (gateResult.status === 0 || (gateResult.stdout || "").includes("not configured")) {
    console.log(`  ✓ gate runner responds (${answers.testFramework !== "none" ? "test configured" : "test not configured yet"})`);
  } else {
    console.log(`  ✗ gate runner failed (exit ${gateResult.status})`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(answers, cliOptions) {
  logSection("Scaffold Complete");
  console.log(`Project: ${answers.projectName}`);
  console.log(`Location: ${answers.targetPath}`);
  console.log(`Branch: ${answers.branchStrategy === "staged" ? answers.workingBranch : "main"} (current)`);
  console.log(`Framework: ${answers.framework === "vite" ? "Vite + React + TypeScript" : "none"}`);
  console.log(`Deploy: ${answers.deployTarget}`);
  console.log(`Tests: ${answers.testFramework}`);

  if (cliOptions.remoteWasSet) {
    console.log(`Remote: origin → ${cliOptions.remote}`);
  }

  console.log("\nQuick start:");
  if (cliOptions.skipInstall) {
    console.log(`  cd ${answers.targetPath} && npm install`);
  }
  if (answers.framework === "vite") {
    console.log("  npm run dev             # start Vite dev server on :5173");
  }
  if (answers.testFramework !== "none") {
    console.log("  npm run test            # run the test suite");
  }
  console.log("  npm run typecheck       # validate TypeScript");
  console.log("");
  console.log("When you're ready:");
  if (answers.branchStrategy === "staged") {
    console.log("  code, checkpoint, publish on development → promote staging → promote production → ship");
  }
  console.log("  Update TCTBP.json commands when you add lint/format scripts.");

  if (answers.deployTarget !== "none yet") {
    console.log(`\nDeploy setup: configure the deployCommand in .github/TCTBP.json for your ${answers.deployTarget} targets.`);
  }
}

function printDryRun(answers) {
  logSection("Scaffold Dry Run");
  console.log(`Would create project '${answers.projectName}' at ${answers.targetPath}`);
  console.log(`Working branch: ${answers.workingBranch}`);
  console.log(`Strategy: ${answers.branchStrategy}`);
  console.log(`Framework: ${answers.framework}`);
  console.log(`Deploy target: ${answers.deployTarget}`);
  console.log(`Test framework: ${answers.testFramework}`);
  console.log("Would run: npm install (use --skip-install to preview without it)");
  console.log("Would prompt: Git remote URL (use --remote <url> or --skip-remote)");  console.log("If remote is set: would push all branches to origin");  console.log("\nNo files or directories were created.");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function runIn(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with code ${result.status}`);
  }
}

function logSection(title) {
  console.log(`\n${title}`);
  console.log("=".repeat(title.length));
}

function logItem(label, value) {
  console.log(`${label}: ${value}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(args) {
  const result = {
    name: null,
    target: null,
    working: null,
    strategy: null,
    deploy: null,
    test: null,
    defaults: false,
    dryRun: false,
    list: false,
    skipInstall: false,
    skipRemote: false,
    remote: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--name": result.name = args[++i]; break;
      case "--target": result.target = args[++i]; break;
      case "--working": result.working = args[++i]; break;
      case "--strategy": result.strategy = args[++i]; break;
      case "--framework": result.framework = args[++i]; break;
      case "--deploy": result.deploy = args[++i]; break;
      case "--test": result.test = args[++i]; break;
      case "--remote": result.remote = args[++i]; break;
      case "--defaults": result.defaults = true; break;
      case "--dry-run": result.dryRun = true; break;
      case "--skip-install": result.skipInstall = true; break;
      case "--skip-remote": result.skipRemote = true; break;
      case "--list": result.list = true; break;
    }
  }

  return result;
}

function printUsage(exitCode) {
  console.log("Usage: node scripts/tctbp-run-scaffold.js [--name <name>] [--target <path>] [--working <branch>] [--strategy staged|simple] [--framework vite|none] [--deploy <target>] [--test vitest|jest|none] [--remote <url>] [--defaults] [--dry-run] [--skip-install] [--skip-remote] [--list]");
  process.exit(exitCode || 0);
}

// Self-executing when called directly
if (require.main === module) {
  // main() is called above via the options parsing
}
