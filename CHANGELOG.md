# Changelog

All notable changes to the TCTBP-Web template will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-30

### Added
- Initial TCTBP-Web template repository with v10 profile schema
- Deterministic Node.js runner architecture (18 runners) for all TCTBP workflows
- Staged branch model (development → staging → main) with `promote` and targeted `deploy`
- Code-loss prevention: safety tags, merge deletion audits, pre-push net-deletion checks
- `scaffold` trigger: interactive project factory with 6-question interview
- Unit test scaffolding (Vitest default, Jest optional) in generated projects
- `handover local` variant for same-machine session boundaries
- Runtime advisory for dev server detection during handover
- `gate`, `version status`, `rollback`, and `orient` triggers
- Preview-first execution (`--dry-run` default) on all mutating runners
- Regression coverage for branch strategies, runner loading, status recommendations, and scaffolding
- Adviser inspection contract v1 with capability negotiation and stable reason/guardrail identifiers
- Non-fetching `status --json --no-fetch` output with a published JSON Schema
- Shared simple, staged, and long-lived contract fixtures
- Contract metadata and schema propagation through the project scaffold

### Fixed
- Prevented the test gate from recursively invoking itself
- Made status recommendations stop-first for unresolved operations, divergence, and dirty-behind states
- Centralised branch-role resolution across branch, status, resume, release, promote, and deploy runners
- Restored missing promotion and deployment runner dependencies and dry-run execution paths
- Completed long-lived branch strategy support in scaffolded profiles, branches, remotes, and summaries
