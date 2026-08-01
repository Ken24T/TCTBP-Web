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
- **Default source ref:** `main`; use an explicitly supplied source ref instead when provided.
- **Source revision:** resolve the selected source ref to the full 40-character commit SHA during preflight. Never rely on a hard-coded or stale SHA. Record the selected ref and resolved SHA before copying anything.
- **Default target:** `/home/ken/Documents/development/repos/TCTBP-Adviser` when no target is supplied.
- **Target state:** existing repository already using the TCTBP-Web runtime.
- **Target branch:** use a dedicated upgrade branch in TCTBP-Adviser; do not work directly on its `main` or `development` branch unless the user explicitly requests that. If no branch is supplied, create `upgrade/tctbp-web-<short-source-sha>` from the verified current target branch.
- **Application-level updates:** include the Adviser inspection/reference/recommendation/intent/UI updates by default; skip Phase 2 only when the user explicitly requests a runtime-only reconciliation.

## Required preflight

1. Read the source and target repository status, branch, remotes, and current HEADs.
2. Confirm the source working tree is clean. When the selected ref is `main`, confirm TCTBP-Web `main` is in sync with `origin/main`; otherwise resolve and verify the explicitly selected ref without changing the source repository.
3. Confirm TCTBP-Adviser is clean and in sync before creating the upgrade branch.
4. Read the source `.github/TCTBP.json`, `.github/TCTBP Agent.md`, `.github/TCTBP Cheatsheet.md`, reconciliation prompt, and scaffold runner. Treat the scaffold runner's `RUNNER_FILES`, `GITHUB_FILES`, and `CONTRACT_FILES` arrays as the authoritative managed runtime inventory.
5. Read the target `.github/TCTBP.json`, `.github/TCTBP Agent.md`, `.github/copilot-instructions.md`, `.tctbp/source.json`, `package.json`, and current Adviser architecture documentation.
6. Capture a read-only inventory of source-managed files that differ between the two repositories, including missing files, target modifications, and source-only files. If the target metadata supports presence patterns but not content hashes, report content comparison as unavailable rather than claiming the files match.
7. Stop and ask if either repository has uncommitted changes, an active Git operation, a detached HEAD, or a diverged branch. The only preparation exception is an explicitly approved prompt-only correction in TCTBP-Web; its runtime and policy files must remain clean and the prompt correction must not be copied into the target runtime surface.

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

Update `.tctbp/source.json` or the equivalent managed-surface metadata to record the exact source repository, selected source ref, full resolved source revision, source version, and authoritative managed files or patterns. If content hashes are not available, preserve an explicit uncertainty that content comparison is unavailable.

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

Update every pinned TCTBP reference from the old value to the full resolved TCTBP-Web source revision used for this upgrade, including source metadata, reference catalogue code, fixtures, tests, and architecture documentation. Define any new observation fields and capability identifiers as additive contract changes, bump the contract minor version when the contract changes, and distinguish configured, present, absent, malformed, and unobserved evidence without treating missing optional hardening evidence as unsafe.

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

The upgrade operator may run only the fixed verification commands listed below. This does not permit the Adviser service to execute commands, scripts, hooks, package tasks, or `TCTBP.json` command strings read from an inspected repository.

## Verification

Run in TCTBP-Adviser after reconciliation and application updates:

```text
npm test
npm run typecheck
npm run build
node scripts/tctbp-run-status.js --json --no-fetch
```

Also verify:

- the TCTBP-Adviser contract fixtures pass;
- the reference catalogue source revision matches the selected TCTBP-Web ref;
- the managed TCTBP surface is complete, with content comparison reported as unavailable when no hashes exist;
- the Adviser API remains local-only and read-only;
- no Adviser service path executes target repository command strings;
- DDRE-specific backup/restore files were not copied;
- the target working tree is clean only after an explicitly approved checkpoint; otherwise report the expected uncommitted changes and do not commit;
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
