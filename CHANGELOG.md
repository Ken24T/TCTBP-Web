# Changelog

All notable changes to the TCTBP-Web template will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
