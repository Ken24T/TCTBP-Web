# TCTBP-Web Template – Copilot Instructions

> **TEMPLATE REPOSITORY ONLY.** These instructions apply to the TCTBP-Web template repo itself — not to projects scaffolded from it. Scaffolded projects receive a different set of instructions (see `templates/copilot-instructions.md.template`) focused on application development with file-size limits, modularity rules, and framework-specific conventions.

## Purpose

This repository is the canonical source for the TCTBP-Web workflow templates, deterministic Node.js runners, and project scaffold factory.

Use it to:

- define and evolve the TCTBP-Web runner architecture and staged branch model
- keep the runner logic, code-loss prevention, and scaffold factory separate from any one project
- maintain copyable templates and runners for downstream web repositories
- create new fully-instrumented web projects via the `scaffold` trigger

When editing this repository, prefer general rules, profile-driven configuration, and placeholders over project-specific implementation detail.

## Authoritative Files

The TCTBP-Web template set is defined by:

- `.github/agents/TCTBP.agent.md` for the runtime entry point that routes explicit TCTBP trigger phrases to the specialised workflow agent
- `.github/TCTBP.json` for the machine-readable project profile schema (v10) and workflow policy
- `.github/TCTBP Agent.md` for behavioural rules, guard rails, and workflow intent
- `.github/TCTBP Cheatsheet.md` for the operator quick reference
- `.github/copilot-instructions.md` for template usage guidance and customisation notes
- `.github/hooks/tctbp-safety.json` for optional runtime approval enforcement on risky git terminal commands
- `scripts/tctbp-pretool-hook.js` for the hook logic
- `scripts/tctbp-runtime.js` for repo root and profile resolution
- `scripts/tctbp-core.js` for the shared runner library (git ops, gates, JSON, tables)
- `scripts/tctbp-gates.js` for verification gates, build gates, and ship gates
- `scripts/tctbp-git-ops.js` for raw git execution, fetch, branch inspection, and sync state
- `scripts/tctbp-output.js` for logging, table formatting, working-tree summaries, and recommendations
- `scripts/tctbp-profile-io.js` for profile I/O, semver parsing, and version source resolution
- `scripts/tctbp-status-report.js` for post-trigger status report rendering
- `scripts/tctbp-run-*.js` for individual deterministic workflow runners
- `scripts/tctbp-run-scaffold.js` for the project factory
- `.github/prompts/` for reusable reconcile and scaffold prompts
- `templates/` for scaffold-generated project skeleton files

When these files change, keep them aligned. Avoid duplicating logic in one file that contradicts another.

In this repository, the scaffold prompt is expected to be discoverable through the explicit trigger `scaffold`, `scaffold web`, `new project`, or `create project`.

## Template Design Rules

Use these rules whenever you edit or extend the template set.

1. Keep workflow rules generic and profile-driven.
2. Put project-specific values behind `TCTBP.json` profile fields, not in runner source.
3. Keep the profile schema easy for downstream repositories to fill in without redesigning it.
4. Prefer configuration over prose when a rule must be machine-readable.
5. Prefer prose over configuration when a rule depends on judgement or safety context.
6. Never hard-code a framework, build tool, deploy target, or branch name in the runners.
7. Preserve the no-code-loss guarantees across all workflows.
8. Keep the hook layer narrow, auditable, and optional.
9. Runners must work immediately after scaffold, before any `node_modules` or framework exists.

## Downstream Customisation Checklist

When the scaffold creates a new project, it populates these values from the interview answers. When reconciling an existing project, replace these manually:

- project name and description
- branch strategy (`"simple"`, `"staged"`, or `"long-lived-environment-branches"`)
- working branch name (for staged/long-lived strategies)
- version files (default: `package.json`)
- test, lint, build, and format commands
- dev server port for runtime advisory
- deploy target configuration
- documentation paths for docs-impact review
- locale

## Placeholder Convention

Template files in `templates/` use `{{PLACEHOLDER}}` syntax. Examples:

- `{{PROJECT_NAME}}`
- `{{PROJECT_DESCRIPTION}}`
- `{{WORKING_BRANCH}}`
- `{{DEPLOY_TARGET}}`
- `{{TEST_FRAMEWORK}}`

The scaffold runner replaces these during project creation.

## Quality Bar For This Repo

Changes in this repository should improve one or more of:

- clarity of the TCTBP-Web workflow
- safety guarantees and code-loss prevention
- portability across web frameworks and deploy targets
- ease of creating a new project via `scaffold`
- runner correctness and profile-driven determinism
- consistency between the JSON profile and the Markdown guidance

## Handover Continuation Prompts

When performing a `handover`, compose a continuation file at `.tctbp/continuation/YYYY-MM-DD-HHmm.md` (UTC, 24-hour time). This lets a session on another machine pick up where this session left off. Use this structure:

```markdown
# Handover Continuation — YYYY-MM-DD

## Session Summary
What was accomplished, key decisions, intentionally deferred work.

## Plan Progress
Which chunks/tasks completed, which is next, and the relevant plan file.

## Files Touched
Key files modified or created with a short note on what changed in each.

## Tickets
Tickets worked on and any still-open for the next session.

## Checkpoint Log
Commit hashes created this session in order with one-line messages.

## Mistakes & Gotchas
Things that went wrong and how they were fixed. Include WHY, not just WHAT.

## Branch & Commit Context
- Machine, branch, last commit, working tree state, upstream sync, remote URL.

## Next Session
The recommended first action for the next session. Be specific.
```

For `handover local`, the continuation file is committed locally only — no push to origin. This is useful for same-machine context preservation between chat sessions.

Say `orient` or `pick up from handover` in the next session to load the newest continuation file.

## Workflow Expectations

For TCTBP activation, workflow order, sync safety, docs-impact checks, versioning, tagging, and approvals, follow:

- `.github/TCTBP.json` as the authoritative profile and policy source
- `.github/TCTBP Agent.md` for behavioural interpretation and guard rails
- `.github/TCTBP Cheatsheet.md` for short operator guidance

Supported triggers include all canonical TCTBP triggers plus `scaffold`, `promote` (staging/review/production), targeted `deploy` (dev/staging/production), `gate` (test/lint/build), `ticket` (create/report/triage), `version` (status/check), `rollback`, `release`, and `handover local`.

## Relationship to Canonical TCTBP

TCTBP-Web is a specialised downstream of the canonical [TCTBP](https://github.com/Ken24T/TCTBP) repository. It reuses the canonical agent model and workflow vocabulary while adding:

- Deterministic Node.js runners for every workflow (status, checkpoint, publish, handover, resume, abort, ship, branch, rollback, version, gate, deploy, promote, release, ticket, scaffold)
- Three branch strategies: `simple` (single branch), `staged` (development → staging → production), and `long-lived-environment-branches` (development → review → production)
- Explicit `promote` and per-environment `deploy` workflows
- Code-loss prevention (safety tags, merge deletion audits, pre-push net-deletion checks)
- A `scaffold` trigger that creates fully-instrumented new web projects
- Handover continuation prompts for multi-machine development

When reconciling a web project, you can reconcile from either the canonical TCTBP repo or from TCTBP-Web. Use TCTBP-Web as the source when the target project should gain the runner architecture and staged branch model.

## Editing Guidance

- Prefer small, focused edits over broad rewrites.
- Keep the files copyable into a fresh repository with minimal follow-up changes.
- Keep the scaffold templates current with the installed runner surface.
- Test scaffold end-to-end after changes to templates or the scaffold runner.
- Document any schema change in both the JSON profile and the surrounding Markdown guidance.
