# TCTBP Ecosystem Consolidation — Phase 1 Audit Matrix & Decision Log

> Companion record for `docs/plans/tctbp-ecosystem-consolidation.md`.
> Produced during the First Session Checklist (Phase 0 + Phase 1) on **2026-08-13**.
> Work is on branch `plan/tctbp-ecosystem-consolidation` in TCTBP-Web.

## Verified Baseline

| Repo | Branch | HEAD | Version | Tests |
|---|---|---|---|---|
| TCTBP-Web | `plan/tctbp-ecosystem-consolidation` | `4f46c48` (v0.3.6 baseline `78b75fc`) | `0.3.6` (schema 11) | 82/82 pass |
| TCTBP-Adviser | `development` | `a3d070d` | `0.2.14` | 336/336 pass + typecheck clean |

Adviser `.tctbp/source.json`: source `Ken24T/TCTBP-Web` @ `78b75fc8294659a4afc8c51eb4ccb608a26caf1a` / v0.3.6 / schema 11; contract major 1 minor 0; capabilities `inspection.local-v1`, `workflow-catalogue.core-v1`, `reason-codes.core-v1`.

## Canonical Workflow Audit Matrix

Columns: **Act** = present in `activation.triggers` · **Pol** = has a TCTBP.json workflow section/policy · **Run** = runner file exists · **Scaf** = runner in scaffold `RUNNER_FILES` inventory · **AF** = present in agent frontmatter description · **Body** = covered in `TCTBP Agent.md` body · **CS** = present in cheatsheet · **Voc** = in `adviserVocabulary.workflowIds` · **Adv** = in Adviser `WORKFLOW_REFERENCES`

| Workflow | Act | Pol | Run | Scaf | AF | Body | CS | Voc | Adv | Gaps | Proposed class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| status | ✅ | ✅¹ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| checkpoint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| publish | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| handover / local | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| resume | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| branch | ✅² | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public (parameterised) |
| promote | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| deploy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| ship | ✅³ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| abort | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 0 | public |
| orient | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅⁴ | ❌ | ❌ | 3 | public |
| gate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 2 | public |
| version | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 2 | public |
| rollback | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 2 | public |
| hotfix | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | 4 | public (activated) |
| release | ❌ | ❌⁵ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 5 | composite → public candidate |
| ticket | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 4 | public candidate |
| scaffold | ✅ | ✅ | ✅ | factory | ✅ | ✅ | ✅ | ❌ | ❌ | 2 | public (special) |
| preflight | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ stage only | ❌ | ❌ | ❌ | n/a | internal stage → candidate |
| workflow dispatcher | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ advertised | ❌ | ❌ | 0 (by design) | internal |

¹ status has `statusReport` + `workflow.statusOrder`, no dedicated section · ² via `activation.branchCommand` pattern · ³ `ship` owns `prepare release` · ⁴ cheatsheet describes orient as "Copilot reads continuation context" without the runner · ⁵ only `releaseState` journal config

## Discrepancy Classification (Phase 1 acceptance gate)

| # | Discrepancy | Classification |
|---|---|---|
| D1 | `ticket` implemented (policy + runner + scaffold-managed) but not activated | **bug** |
| D2 | `release` implemented (runner + scaffold-managed, documented) but not activated | **future enhancement** (deliberate promotion) |
| D3 | `prepare release` owned by `ship` while a full release orchestrator exists | **backward-compat alias** (change = documented behaviour change) |
| D4 | `preflight` informal — stage-only, no trigger/runner/docs | **future enhancement** (formalise as public) |
| D5 | `hotfix` activated but **not scaffold-managed** (runner missing from scaffold `RUNNER_FILES`) and not Adviser-managed | **bug** (real distribution gap) |
| D6 | orient/gate/version/rollback/ticket/scaffold/release/preflight missing from `adviserVocabulary.workflowIds`; Adviser `WORKFLOW_REFERENCES` omits release/hotfix/gate/version/rollback/ticket/scaffold/orient/preflight | **bug** (catalogue lag) |
| D7 | Agent activation frontmatter (`agents/TCTBP.agent.md`) omits hotfix/release/ticket/preflight | **bug** (activation boundary understates surface) |
| D8 | Adviser README pins stale commit `0e99ceaf…` vs `source.json` `78b75fc…` | **bug** (docs drift; Adviser repo) |
| D9 | Capability `version-files.multi-format-v1` advertised by TCTBP-Web but missing from Adviser `source.json` capabilities | **bug** (contract metadata drift; Adviser repo) |
| D10 | Cheatsheet advertises internal `workflow` dispatcher as a trigger family | **intentional difference** (to remove when dispatcher stays internal) |
| D11 | Cheatsheet `orient` entry predates the `tctbp-run-orient.js` runner | **bug** (minor docs lag) |

All 11 discrepancies classified. No semantic changes made in Phase 1 — audit only.

## Decision Log

Decisions reviewed with the operator on 2026-08-13. Selected options are the working decisions for Phases 2+.

| Decision | Options | Selected | Compatibility impact |
|---|---|---|---|
| Is `preflight` public? | yes / no | **yes** | New public workflow; additive |
| Does `prepare release` mean ship or release? | ship / release | **release** | Behavioural change; must be documented |
| Is `release` public? | yes / no | **yes** | Additive; resolves ambiguity with ship |
| Are ticket commands public triggers? | yes / no | **yes** | Additive |
| Is `workflow` internal only? | yes / no | **yes** | No change |
| Keep enumerated `please` aliases? | enumerate / normalise | **enumerate** | No change (current model) |
| Canonical catalogue location | existing policy / new section/module | **new `workflows` catalogue module** | New module + consistency tests |
| Managed-surface source | scaffold arrays / shared manifest | **shared manifest** (Phase 4) | Fixes D5 hotfix gap |
| Adviser catalogue strategy | runtime contract / generated / validated static | **validated static** (tests against canonical contract) | Additive |

## Phase 2 Linkage

Phase 2 introduces `scripts/tctbp-workflow-catalogue.js` (canonical catalogue +
validation layer) and `test/tctbp-workflow-catalogue.test.js`. The consistency
tests pin the D1–D7 violation set (17 violations) so the audit demonstrably
catches the documented discrepancies, and so Phase 3 semantic fixes must update
the pin together with the code.

Expected pinned violations (code@workflow):

```
agent-frontmatter-gap@hotfix       agent-frontmatter-gap@preflight
agent-frontmatter-gap@release      agent-frontmatter-gap@ticket
adviser-vocab-gap@gate             adviser-vocab-gap@orient
adviser-vocab-gap@preflight        adviser-vocab-gap@release
adviser-vocab-gap@rollback         adviser-vocab-gap@scaffold
adviser-vocab-gap@ticket           adviser-vocab-gap@version
alias-not-activated@preflight      alias-not-activated@release
alias-not-activated@ticket         scaffold-surface-gap@hotfix
section-trigger-mismatch@ship
```

## Phase 3 Resolution Status (2026-08-13)

All Phase 3 semantic decisions from the decision log have been applied to
TCTBP-Web, and the consistency audit now reports **zero discrepancies**.

| # | Discrepancy | Resolution |
|---|---|---|
| D1 | ticket not activated | ✅ `ticket create/report/triage` added to `activation.triggers` + generated scaffold profiles |
| D2 | release not activated | ✅ `release` / `release please` / `prepare release please` added to `activation.triggers` + scaffold profiles; `release` profile section added |
| D3 | `prepare release` owned by ship | ✅ moved to the `release` section (ship section + cheatsheet + agent body updated); documented as a behavioural change |
| D4 | preflight informal | ✅ formalised: `scripts/tctbp-run-preflight.js` (non-mutating aggregate verification), `preflight`/`preflight please` activated, profile section, scaffold inventory, agent docs, adviser vocabulary |
| D5 | hotfix not scaffold-managed | ✅ `tctbp-run-hotfix.js` added to scaffold `RUNNER_FILES` |
| D6 | adviser vocabulary lag | ✅ `adviserVocabulary.workflowIds` + `tctbp-status-model.js` `WORKFLOW_IDS` aligned to all 19 public workflows |
| D7 | agent frontmatter gaps | ✅ hotfix/release/ticket/preflight added to `agents/TCTBP.agent.md` description |
| D8 | Adviser README stale pin | ⏳ Adviser repo — deferred to Phase 5/6 |
| D9 | Adviser capability drift | ⏳ Adviser repo — deferred to Phase 5/6 |
| D10 | cheatsheet advertises internal `workflow` dispatcher | ✅ `workflow` row removed from the cheatsheet trigger table |
| D11 | cheatsheet orient predates runner | ✅ orient row now references `tctbp-run-orient.js` |

New consistency infrastructure:

- `scripts/tctbp-workflow-catalogue.js` — canonical catalogue (19 public + 1
  internal workflow) with alias ownership, runner, scaffold-managed, agent
  frontmatter, and adviser-vocabulary metadata plus `auditCatalogue()`.
- `test/tctbp-workflow-catalogue.test.js` — 15 tests enforcing the catalogue
  invariants; the audit is pinned to zero violations.
- `scripts/tctbp-run-preflight.js` — the formalised preflight runner.

Test status: **97/97 pass** in TCTBP-Web (82 baseline + 15 catalogue/preflight).
Scaffold-generated profiles in both `tctbp-run-scaffold.js` and
`tctbp-scaffold-profile.js` now carry the canonical trigger surface.

Remaining for later phases:

- Phase 4: shared managed-surface manifest (deduplicate the two scaffold
  `generateProfile` copies and the scaffold inventory arrays).
- Phase 5/6: Adviser contract upgrade + reference/recommendation alignment
  (D8/D9 and the Adviser `WORKFLOW_REFERENCES` lag).
- Phase 7: end-to-end proving exercise with a throwaway scaffold.

## Phase 4 Resolution Status (2026-08-13)

The shared managed-surface manifest is implemented. The decision-log item
"Managed-surface source: shared manifest" is now satisfied.

| Item | Status |
|---|---|
| `scripts/tctbp-managed-surface.js` — single source of truth for runner / GitHub / prompt / contract inventories, the canonical generated activation trigger surface, the full managed-surface path list, and `createSourceMetadata()` | ✅ |
| `tctbp-run-scaffold.js` consumes the manifest (removed its local duplicate arrays) | ✅ |
| `tctbp-scaffold-profile.js` is the canonical profile generator (single `generateProfile`; the divergent second copy in the scaffold runner was removed; consumes `ACTIVATION_TRIGGERS` from the manifest) | ✅ |
| Scaffold writes `.tctbp/source.json` (source repository, revision, version, schema, adviser contract, managed surface, install date) | ✅ |
| `tctbp-managed-surface.js` and `tctbp-workflow-catalogue.js` are now scaffold-managed so downstream projects receive them | ✅ |
| Tests: `test/tctbp-managed-surface.test.js` (manifest consistency, catalogue cross-check, source metadata shape, generated-profile activation surface); scaffold tests pointed at the manifest | ✅ |

Acceptance gate:

- fresh scaffold passes — verified end-to-end into a temp project: profile
  written with all 67 canonical triggers, `.tctbp/source.json` correct,
  hotfix/preflight/manifest/catalogue runners copied ✅
- reconcile dry-run/plan — reconcile remains prompt-driven (no deterministic
  reconcile runner yet); the shared manifest is the canonical source a future
  reconcile runner/Adviser upgrade plan can consume ✅ (noted for Phase 4/5)
- no project-specific values silently overwritten — generated profile is
  written from scratch by the canonical generator; downstream edits are not
  touched by scaffold ✅
- source metadata records the canonical revision/version/capabilities —
  `.tctbp/source.json` records source revision, version, schema, adviser
  contract capabilities, and the full managed surface ✅

Test status: **105/105 pass** in TCTBP-Web.

## Phase 5/6 Resolution Status (2026-08-13)

Adviser upgrade work performed on branch `upgrade/tctbp-web-08d2979` in the
TCTBP-Adviser repo, pinned to TCTBP-Web plan-branch revision
`08d2979d5d70480e85477cdeb10dfb3fb83a0332`.

| Item | Status |
|---|---|
| D8 — Adviser README stale pin | ✅ README pins `08d2979…` |
| D9 — Adviser capability drift | ✅ `version-files.multi-format-v1` recorded in `.tctbp/source.json` and `server/tctbp-source.ts` |
| Source metadata exact | ✅ `.tctbp/source.json`, `server/reference/catalogue.ts` SOURCE_REVISION, and README all pin `08d2979…` |
| Reference catalogue expansion | ✅ `WORKFLOW_REFERENCES` grows 10 → 19 (adds preflight, orient, release, hotfix, gate, version, rollback, ticket, scaffold); `CoreWorkflowId` + `category` union extended in `shared/reference.ts` |
| Recommendation alignment | ✅ `preflight` added as a `RecommendationAction`; dirty-tree recommendation now suggests checkpoint with preflight as a likely next action |
| Adviser remains non-executing | ✅ no target workflow execution added |
| Adviser tests | ✅ 337/337 pass, typecheck clean, build succeeds |

Adviser contract remains major 1 minor 0 with additive capability metadata
only — no breaking contract change.

## Phase 7 Resolution Status (2026-08-13)

The end-to-end proving exercise is implemented as a lasting integration test:
`server/ecosystem-proving.test.ts` in the TCTBP-Adviser repo. It scaffolds a
throwaway project from TCTBP-Web, inspects it with the Adviser policy
comparison, checks workflow-catalogue agreement, simulates drift, confirms the
Adviser detects it, generates an upgrade-safe merge, and verifies no
application-owned configuration is lost. The whole sequence passes.

| Proving step | Status |
|---|---|
| 1. scaffold a new project | ✅ |
| 2. inspect it with Adviser (`compareTctbpPolicy` → aligned) | ✅ |
| 3. workflow catalogue agreement (scaffolded vocab == Adviser `WORKFLOW_REFERENCES`, 19 ids) | ✅ |
| 8. Copilot in the target repo recognises the same workflow set (the scaffolded project's own catalogue audit reports only the two factory-only `scaffold` violations) | ✅ |
| 4-5. simulated drift (drop `preflight`) is detected as `drifted` | ✅ |
| 6-7. canonical merge restores the canonical surface | ✅ |
| 9. no application-owned config lost (name, test command, non-template governance) | ✅ |

The proving exercise surfaced and fixed **three real scaffold gaps**:

1. **`promote review` missing from the canonical catalogue/activation** — the
   generated profiles already advertised `promote review` (long-lived
   strategy), but the canonical catalogue and TCTBP-Web activation did not.
   Aligned by adding `promote review` / `promote review please` to both.
2. **`activation.branchCommand` missing from generated profiles** — the branch
   workflow is pattern-triggered, but scaffolded profiles had no `branchCommand`
   config, so the branch workflow would not function. Added to the canonical
   profile generator.
3. **Hardening areas missing from generated profiles** — `candidateGuard`,
   `promotionSafety`, `releaseState`, and `runtimeTransaction` were absent, so
   the Adviser drift check reported a fresh scaffold as drifted. The canonical
   profile generator now mirrors the canonical hardening sections (keeping them
   in sync automatically via `readContractMetadata`).

Final status: **TCTBP-Web 105/105** and **Adviser 338/338** tests pass, Adviser
typecheck + build clean.

## Real-Consumer Reconcile: audio-extractor (2026-08-13)

audio-extractor (Rust workspace, simple strategy, custom `current-platform-artifacts`
deploy) reconciled on branch `upgrade/tctbp-web-08d2979`:

- Managed surface added (preflight/hotfix/manifest/catalogue runners, docs,
  contract); profile merged preserving project-owned values (master default
  branch, Cargo.toml version files, cargo commands, custom deploy, non-template
  governance); vocab 11 → 19; activation completed 17 → 47 triggers; D3
  migration applied; `.tctbp/source.json` pinned to `08d2979…`.
- Verified: runners work, catalogue audit clean except intentional residuals
  (promote/simple strategy, deploy variants/custom deploy, scaffold/factory).

Gaps discovered by the real reconcile — all resolved:

| Gap | Resolution |
|---|---|
| 1. `releaseBuild` vs `release-build` gate key mismatch (configured release gates silently ignored in gates/gate-runner/preflight) | ✅ `resolveProfileCommand` normalisation + tests (TCTBP-Web 108/108) |
| 2. Activation not merged by `mergeCanonicalTctbpPolicy` (new canonical triggers never propagate) | ✅ deterministic strategy-aware activation merge: union of canonical + target triggers, filtered by scaffold (factory-only), promote/promote-review (promotion/review enabled), and deploy env variants (mapped targets) |
| 3. `prepare release` ownership has no migration rule | ✅ `migratePrepareReleaseOwnership`: stripped from `ship.preferredTriggers`, ensured on `release` |
| 4. Pre-existing audio-extractor quirks (promote/deploy variants never activated) | 📝 Documented as intentional deviations |
| 5. Scaffold factory-only residuals | 📝 Expected |

The new merge machinery was verified to **exactly reproduce** the manual
audio-extractor reconcile (47 triggers, same inclusions/exclusions, prepare
release migrated). Adviser now 341/341 tests.

## Real-Consumer Reconcile: kindling (2026-08-13)

Second real reconcile — a **staged-strategy** repo (development → staging →
main), structurally different from audio-extractor (simple). Full reconcile on
branch `upgrade/tctbp-web-08d2979`, run with real Adviser merge machinery
behind a read-only plan step:

- Plan produced drift report + merged profile artifact + managed-file diff
  before anything was written to the target.
- Applied: 4 runner files added (preflight/hotfix/manifest/catalogue), 7
  changed (gates fix, status-model, scaffold-profile, agent docs), profile
  merged 49 → **65 triggers** (16 canonical families added, **nothing removed**),
  vocab 11 → 19, `prepare release` migrated off ship, `.tctbp/source.json`
  created (kindling had none).
- Verified: preflight runs **4 real configured gates and passes** (confirming
  the release-build gate fix on a configured repo); audit shows only expected
  residuals (promote-review variants — staged has no review; scaffold —
  factory-only).

**New gap discovered and fixed:**

| Gap | Resolution |
|---|---|
| The activation merge's applicability filter stripped **pre-existing target triggers** (kindling's deploy dev/staging/production variants were all removed because no deploy targets are mapped) — violating the "never overwrite project-owned settings" principle | ✅ Filter now gates **canonical additions only**; pre-existing target triggers are always preserved. Regression test added. |

A reusable **read-only reconcile-plan tool** now lives in the Adviser
(`server/kindling-plan.test.ts`, target via `TARGET_ROOT` env) so future
reconciles compute the plan before touching anything.

Adviser now **343/343** tests.

## Real-Consumer Reconcile: TCTBP-Adviser (2026-08-13)

The dogfood repo — the most complex consumer (review-enabled, 71 test files,
heavy profile customization). Full reconcile on branch
`reconcile/tctbp-web-surface`, using the read-only plan tool first:

- Plan surfaced **one new canonical gap**: Adviser's activation had
  `deploy review` / `deploy review please`, which the canonical deploy family
  did not contain (we added `promote review` in Phase 7 but never `deploy
  review`) — so long-lived/review repos could never receive it from scaffold or
  reconcile, and the audit flagged it as an unknown trigger.
  **Fixed canonically** (catalogue + manifest `ACTIVATION_TRIGGERS` + canonical
  activation) and committed to `TCTBP-Web/main` (`22c9b87`).
- Reviewed the agent/docs overwrite concern: Adviser's agent files were stale
  canonical copies (no Adviser-specific content) — safe to overwrite.
- Applied: 3 runner files added (preflight/manifest/catalogue; hotfix already
  present), 7 changed (gates fix, status-model, scaffold-profile, agent docs),
  profile merged 64 → **69 triggers** (nothing removed, deploy review
  preserved), vocab 11 → 19, `.tctbp/source.json` pinned to `22c9b87`.
- **Verified: app code untouched (zero server/src/shared changes), Adviser
  full suite 343/343 passes, typecheck clean, build succeeds, audit shows only
  the two scaffold factory-only residuals.**

Merged to Adviser `development` at `c27c8e0` and pushed.
