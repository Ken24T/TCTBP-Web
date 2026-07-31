# TCTBP-Web

Canonical template repository for web/browser-based projects using the TCTBP workflow with deterministic Node.js runners, a working/staging/production branch model, code-loss prevention, and a `scaffold` trigger that creates fully-instrumented new projects from scratch.

## What This Repo Provides

- **Runner-first TCTBP architecture:** Every workflow (`checkpoint`, `ship`, `promote`, `deploy`, `handover`, etc.) has a dedicated Node.js runner script with preview-first execution and dry-run support.
- **Staged branch model:** `development` → `staging` → `main` with explicit `promote` merges and per-environment `deploy` targets.
- **Code-loss prevention:** Safety tags before merges, configurable merge deletion audits, and pre-push net-deletion checks.
- **Project factory:** The `scaffold` trigger creates a new web project with the full TCTBP-Web runtime pre-installed and configured from your answers.
- **Unit test scaffolding:** Generated projects include Vitest (or Jest) with a working placeholder test so the test gate passes on day one.

## Quick Start — Scaffold a New Project

From within this repo, trigger:

```
scaffold /absolute/path/to/new-project
```

Answer the interview questions and you'll have a fully-instrumented repo with runners, gates, code-loss prevention, and the branch structure ready to go.

## Quick Start — Use This Repo Directly

TCTBP-Web eats its own dog food. All TCTBP triggers work here:

```
status please
checkpoint please
ship please
handover please
```

## Branch Model

TCTBP-Web itself uses the `"simple"` branch strategy (just `main` — it's a template repo, not a deployed app).

Scaffolded projects default to the `"staged"` strategy:

```
development ──promote staging──▶ staging ──promote production──▶ main
     │                                │                                │
     ▼                                ▼                                ▼
 deploy dev                    deploy staging                  ship → deploy prod
```

## TCTBP Runtime Surface

- `.github/agents/TCTBP.agent.md` — Runtime entry point for all TCTBP triggers
- `.github/TCTBP.json` — Machine-readable workflow policy and project profile
- `.github/TCTBP Agent.md` — Long-form behavioural guide and guard rails
- `.github/TCTBP Cheatsheet.md` — Operator quick reference
- `.github/copilot-instructions.md` — Template usage and customisation guidance
- `.github/hooks/tctbp-safety.json` — Optional runtime hook for risky git commands
- `.github/prompts/` — Reconcile and scaffold prompts
- `scripts/` — Deterministic Node.js runners for every workflow
- `templates/` — Project skeleton templates for the scaffold trigger

## Generic Hardening Primitives

The reusable safety modules in `scripts/` provide small, read-mostly building blocks for staged web releases:

- `tctbp-candidate-guard.js` records and verifies Git commit/tree identities, including local and remote-tracking branch drift.
- `tctbp-promotion-safety.js` performs read-only merge-tree preflight, deletion-impact parsing, merge-in-progress detection, and failed-merge recovery.
- `tctbp-release-state.js` and `tctbp-release-resume.js` maintain an atomic release journal and plan evidence checks. Their defaults use `.tctbp-runtime/release-state.json`, `tctbp-release-state`, and development/staging/production stages. Projects may configure `releaseState.path`, `releaseState.kind`, and `releaseState.stageOrder` in `.github/TCTBP.json` (or pass equivalent settings to the module).
- `tctbp-runtime-transaction.js` stages, snapshots, verifies, activates, and rolls back a runtime bundle. Stop/start verification is supplied by the consuming project, and entrypoint validation is optional/configurable.

These are generic state and safety primitives, not a deployment platform. DDRE backup/restore runners and any other environment-specific recovery assumptions remain project-specific and are intentionally not part of TCTBP-Web.

## Requirements

- Node.js 18+
- Git

## Relationship to Canonical TCTBP

TCTBP-Web is a specialised downstream of the canonical [TCTBP](https://github.com/Ken24T/TCTBP) repository. It reuses the canonical agent model, workflow rules, and trigger vocabulary while adding the runner architecture, staged branch model, promote/deploy workflows, code-loss prevention, and the scaffold factory for web projects.
