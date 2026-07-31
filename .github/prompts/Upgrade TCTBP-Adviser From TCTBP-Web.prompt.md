---
description: "Use when explicitly asked to upgrade TCTBP-Adviser from the canonical TCTBP-Web runtime and bring Adviser’s read-only inspection and reference model up to date with the current TCTBP hardening."
name: "upgrade-tctbp-adviser"
argument-hint: "Target repository absolute path, optional source ref, target branch, and whether to include application-level Adviser model updates"
agent: "agent"
---

# upgrade-tctbp-adviser

Use this prompt from the canonical `TCTBP-Web` repository when the user explicitly asks to upgrade the existing `TCTBP-Adviser` repository from the current TCTBP-Web infrastructure.

## Goal

Bring the existing TCTBP-Adviser checkout up to date with the generic TCTBP runtime and hardening surface in this repository, then update Adviser’s read-only inspection, reference, recommendation, and intent-planning model so it can accurately describe the newer TCTBP state.

The canonical source is TCTBP-Web. DDRE Intranet is a production proving ground and reference for concrete behaviour, but it is not the source to copy from during this workflow.

## Fixed boundaries

- **Source repository:** the current TCTBP-Web repository.
- **Default target:** `/home/ken/Documents/development/repos/TCTBP-Adviser` when no target is supplied.
- **Current known canonical source ref:** `3a9723b` (`main`). Always verify `main` and record the exact source SHA actually used before copying anything.
- **Target state:** existing repository already using the TCTBP-Web runtime.
- **Target branch:** use a dedicated upgrade branch in TCTBP-Adviser; do not work directly on its `main` or `development` branch unless the user explicitly requests that.

## Required preflight

1. Read the source and target repository status, branch, remotes, and current HEADs.
2. Confirm TCTBP-Web `main` is clean and in sync with `origin/main`.
3. Confirm TCTBP-Adviser is clean and in sync before creating the upgrade branch.
4. Read the source `.github/TCTBP.json`, `.github/TCTBP Agent.md`, `.github/TCTBP Cheatsheet.md`, scaffold runner, reconciliation prompt, and managed runtime list.
5. Read the target `.github/TCTBP.json`, `.github/TCTBP Agent.md`, `.github/copilot-instructions.md`, `.tctbp/source.json`, `package.json`, and current Adviser architecture documentation.
6. Capture a read-only inventory of source-managed files that differ between the two repositories.
7. Stop and ask if either repository has uncommitted changes, an active Git operation, a detached HEAD, or a diverged branch.

## Phase 1 — Reconcile TCTBP infrastructure

Use the existing reconciliation rules, but review every file rather than overwriting the target wholesale.

Update or add the generic TCTBP-Web runtime surface as appropriate, including:

- `scripts/tctbp-core.js`
- `scripts/tctbp-git-ops.js`
- `scripts/tctbp-profile-io.js`
- `scripts/tctbp-output.js`
- `scripts/tctbp-gates.js`
- `scripts/tctbp-branch-model.js`
- `scripts/tctbp-candidate-guard.js`
- `scripts/tctbp-promotion-safety.js`
- `scripts/tctbp-release-state.js`
- `scripts/tctbp-release-resume.js`
- `scripts/tctbp-runtime-transaction.js`
- `scripts/version-status.mjs`
- `scripts/version-status-policy.mjs`
- the current TCTBP runner scripts and scaffold-managed surface

Update the target policy and documentation carefully so that generic hardening settings are available, while preserving Adviser-specific values such as:

- React/Vite commands and runtime settings
- `development → staging → main` branch model
- Adviser project name, version files, and package scripts
- Adviser-specific deployment descriptions and local development settings
- Adviser application, test, fixture, schema, and architecture files

Use the current TCTBP-Web policy as the structural source, but do not leave TCTBP-Web template values or placeholders in the target.

Update `.tctbp/source.json` or the equivalent managed-surface metadata to record the exact source repository, source ref, source revision, and managed files.

Do not copy DDRE-specific code or assumptions, including:

- `scripts/tctbp-run-backup.js`
- `scripts/tctbp-run-restore-rehearsal.js`
- DDRE production backup receipts
- `.ddre-runtime` paths
- systemd service names or lifecycle commands
- DDRE storage paths and critical JSON data files
- DDRE ticket, roadmap, SharePoint, or intranet runtime integrations

## Phase 2 — Upgrade Adviser’s read-only TCTBP model

After the runtime reconciliation, update Adviser application code so it understands the current canonical TCTBP surface without executing target workflows.

Review and update as appropriate:

- `server/tctbp.ts` and shared inspection types
- `shared/inspection.ts`
- `shared/reference.ts`
- `shared/recommendation.ts`
- `server/reference/workflows.ts`
- `server/reference/guardrails.ts`
- `server/reference/catalogue.ts`
- `server/recommendations/`
- `server/intents/`
- repository-detail and reference UI views
- contract fixtures, JSON schemas, and related tests

Add read-only observations for generic hardening where they are safely and portably available, such as:

- candidate-guard and promotion-safety policy presence
- release-state configuration and journal presence/status
- runtime-transaction configuration presence
- version-status policy and version/tag alignment evidence
- configured merge-deletion thresholds and safety settings

Do not assume that a journal, runtime receipt, or deployment state exists merely because the policy supports it. Report unavailable or unobserved evidence explicitly.

Keep DDRE-specific restore rehearsal and production backup evidence out of the generic Adviser contract unless it is introduced through a clearly named optional capability or downstream provider extension.

Update the pinned TCTBP reference revision from the old value to the exact TCTBP-Web source ref used for this upgrade. Keep the Adviser contract backward-compatible where possible and use additive fields/capabilities rather than breaking existing contract consumers.

Because DDRE currently does not advertise Adviser contract metadata, do not modify DDRE as part of this task. Adviser should either:

- support legacy TCTBP profiles with a clear compatibility warning, or
- report that contract metadata is unavailable without treating the repository as unsafe solely for that reason.

## Safety and product boundaries

Do not:

- execute target repository scripts from Adviser
- execute `TCTBP.json` command strings from Adviser
- add mutation routes to Adviser
- make Adviser run checkpoint, publish, promote, deploy, ship, backup, or restore workflows
- copy DDRE production infrastructure into TCTBP-Web or Adviser
- overwrite Adviser application code wholesale
- use `git reset`, `git checkout` over uncommitted work, stash, rebase, force-push, branch deletion, or history rewriting
- commit or push either repository without explicit user approval
- install new dependencies unless the user approves it and the dependency is required by the reviewed change

Intent plans may display TCTBP triggers, but they must remain non-executing plans.

## Verification

Run in TCTBP-Adviser after reconciliation and application updates:

```text
npm test
npm run typecheck
npm run build
```

Also verify:

- the TCTBP-Adviser contract fixtures pass;
- the reference catalogue source revision matches the selected TCTBP-Web ref;
- the managed TCTBP surface is complete;
- the Adviser API remains local-only and read-only;
- no target repository command strings are executed;
- DDRE-specific backup/restore files were not copied;
- the target working tree is clean after the approved checkpoint;
- the source and target branch/ref status is reported before any publish.

## Final report

Report:

1. exact TCTBP-Web source ref used;
2. target repository and target branch;
3. TCTBP infrastructure files added or updated;
4. Adviser inspection/reference/recommendation files added or updated;
5. target-specific settings intentionally preserved;
6. hardening capabilities now represented;
7. DDRE-specific capabilities intentionally excluded;
8. tests, typecheck, and build results;
9. any contract or capability gaps still requiring a future change;
10. whether any commit or publish occurred.
