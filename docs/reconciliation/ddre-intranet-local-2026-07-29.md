# ddre-intranet-local Reconciliation Report

Generated 2026-07-29 against TCTBP-Web `main` (the canonical source of truth).

## Files that differ from canonical

### `scripts/tctbp-runtime.js` — HARD-CODED PATH

| Aspect | Canonical (TCTBP-Web) | ddre-intranet-local |
|---|---|---|
| `runtimeCwd` | Reads from `TCTBP.json` → `profile.runtimeCwd` | Hard-coded to `spfx/intranet-core/dev` |
| Portability | Works for any project | DDRE-specific |

**Action:** Replace with canonical version. The profile-driven approach already works for ddre — just set `profile.runtimeCwd` to `"spfx/intranet-core/dev"` in ddre's TCTBP.json.

### `scripts/tctbp-core.js` — MONOLITHIC vs MODULAR

| Aspect | Canonical (TCTBP-Web) | ddre-intranet-local |
|---|---|---|
| Structure | Thin re-export layer → `tctbp-git-ops.js`, `tctbp-gates.js`, `tctbp-output.js`, `tctbp-profile-io.js` | Monolithic ~550-line file with everything inlined |
| Missing sub-modules | N/A | No `tctbp-gates.js`, `tctbp-git-ops.js`, `tctbp-output.js`, `tctbp-profile-io.js` |
| Extra functions | N/A | DDRE-specific: `syncRoadmapReleaseNotes`, ticket helpers |

**Action:** Adopt the modular structure. Copy the four sub-module files from TCTBP-Web into ddre, then replace ddre's monolithic `tctbp-core.js` with the canonical re-export version. DDRE-specific helpers (`tctbp-ticket-actions.js`, etc.) can remain as separate modules.

### `scripts/tctbp-run-workflow.js` — ROADMAP RELEASE NOTES REFERENCE

The canonical version has removed the `syncRoadmapReleaseNotes` dependency. ddre's version still imports and calls it.

**Action:** Replace with canonical version, or keep the DDRE version but isolate the roadmap integration behind a config flag.

## Files that exist only in ddre (DDRE-specific, keep)

| File | Purpose | Should move to TCTBP-Web? |
|---|---|---|
| `scripts/tctbp-ticket-actions.js` | Ticket CRUD with DDRE paths | No — DDRE-specific |
| `scripts/tctbp-ticket-inference.js` | DDRE ticket link inference | No — DDRE-specific |
| `scripts/roadmap-release-notes.js` | Roadmap-to-release-note sync | No — DDRE-specific |
| `scripts/add-release-note.mjs` | Release note management | No (has known bugs) |
| `scripts/export-tickets.mjs`, `import-tickets.mjs` | Cross-machine ticket sync | No — DDRE-specific |
| `scripts/publish-runtime-target.js` | DDRE runtime bundle publish | No — DDRE-specific |
| `scripts/restart-runtime-services.sh` | DDRE systemd management | No — DDRE-specific |

## Files missing in ddre that exist in canonical

| File | Purpose |
|---|---|
| `scripts/tctbp-gates.js` | Verification/build/ship gate module |
| `scripts/tctbp-git-ops.js` | Git execution, fetch, sync state |
| `scripts/tctbp-output.js` | Logging, table formatting, recommendations |
| `scripts/tctbp-profile-io.js` | Profile I/O, semver, version source |
| `scripts/tctbp-run-release.js` | Full release pipeline orchestrator |
| `scripts/tctbp-run-ticket.js` | Generalized ticket management runner |

## TCTBP.json drift

The ddre profile has 6+ months of production evolution that has now been generalized and incorporated into the canonical TCTBP-Web profile. The canonical profile is now the superset. Key ddre-specific values to preserve during reconciliation:

- `project.versionFiles: ["spfx/intranet-core/dev/package.json", ...]`
- `profile.versioning.sourceOfTruth: "spfx/intranet-core/dev/package.json"`
- `profile.runtimeCwd: "spfx/intranet-core/dev"` (add this field)
- `branchModel.strategy: "long-lived-environment-branches"`
- `handover.runtimeAdvisory.listeners` (DDRE ports)
- DDRE-specific deploy targets and commands

## Recommended reconciliation order

1. Set `profile.runtimeCwd` in ddre's TCTBP.json
2. Copy the four sub-module files from canonical to ddre
3. Replace ddre's monolithic `tctbp-core.js` with canonical re-export version
4. Copy `tctbp-run-release.js` to ddre
5. Replace `tctbp-run-workflow.js` with canonical (or keep DDRE fork)
6. Replace the TCTBP.json skeleton with canonical, then re-apply DDRE-specific values
7. Run `node scripts/tctbp-run-status.js` to verify
