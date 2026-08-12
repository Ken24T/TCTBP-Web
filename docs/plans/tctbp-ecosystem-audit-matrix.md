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
