# TCTBP Ecosystem Consolidation Plan

## Purpose

This plan coordinates a cross-repository consolidation of **TCTBP-Web** and **TCTBP-Adviser** so they behave as one coherent TCTBP ecosystem.

The desired end state is:

- **TCTBP-Web** is the canonical definition, runtime, distribution source, and compatibility authority for TCTBP workflows.
- **TCTBP-enabled repositories** receive that canonical runtime through scaffold or reconciliation/upgrade, while preserving project-specific configuration.
- **GitHub Copilot inside a TCTBP-enabled repository** can invoke the same canonical workflows using explicit trigger phrases and deterministic runners.
- **TCTBP-Adviser** presents the same workflow contract in a user-friendly GUI, inspects repository state, explains recommendations, highlights drift, and guides a repository manager without inventing a separate model of TCTBP.
- Workflow facts are defined once, then validated or derived everywhere else.

This is an orchestration plan, not an instruction to change both repositories at once. Work should proceed in controlled phases with verification between phases.

---

## Guiding Architecture

```text
                         TCTBP-Web
                    CANONICAL AUTHORITY
                            |
                 workflow + safety contract
                            |
          +-----------------+------------------+
          |                 |                  |
          v                 v                  v
      Scaffold          Reconcile           Adviser
      new repo           existing repo       contract
          |                 |                  |
          +--------+--------+                  |
                   v                           v
            TCTBP-enabled repo          TCTBP-Adviser
                   |                    human-friendly
                   |                    inspection/advice
                   v                           |
              GitHub Copilot <----------------+
             executes workflows
             inside that repository
```

### Core design principle

**One TCTBP definition, two user experiences.**

A technical operator can work directly inside a repository with Copilot and explicit TCTBP triggers. A repository manager can use Adviser to understand state, recommended next action, effects, non-effects, guardrails, compatibility, and upgrade status.

Adviser must not become a second independent definition of TCTBP.

---

## Current Verified Baseline

The following baseline was established from the current repositories before this plan was written.

### TCTBP-Web

- Current release observed: **v0.3.6**.
- Current observed `main` commit: `78b75fc8294659a4afc8c51eb4ccb608a26caf1a`.
- `.github/TCTBP.json` declares itself the machine-readable source of truth.
- The repository contains deterministic runners for status, checkpoint, publish, handover, resume, ship, branch, promote, deploy, abort, gate, version, rollback, orient, workflow dispatch, release, ticket, scaffold support, and associated runtime/safety modules.
- The scaffold runner owns explicit managed-file inventories including runner, GitHub, prompt, and Adviser-contract files.
- Scaffold rejects a populated target and explicitly directs existing projects toward `reconcile-tctbp`.
- `reconcile-tctbp` exists as a prompt-driven workflow for installing, adapting, or refreshing TCTBP infrastructure in another repository while preserving target-specific values.
- The Adviser inspection contract is versioned separately from the TCTBP profile schema and exposes capabilities.

### TCTBP-Adviser

- Current release observed: **v0.2.14**.
- Its README describes Adviser as a local-first companion for repository state, workflow choice, scaffold health, upgrade planning, reference, recommendations, and intent planning.
- Adviser is scaffolded from TCTBP-Web and dogfoods TCTBP workflows.
- Adviser supports read-only scaffold-health assessment and guarded managed-file updates. It does not commit, push, deploy, or execute target repository commands as part of its apply workflow.
- Adviser contains a hand-authored `WORKFLOW_REFERENCES` catalogue.
- `.tctbp/source.json` currently records TCTBP-Web source revision `78b75fc8294659a4afc8c51eb4ccb608a26caf1a`, version `0.3.6`, and schema version `11`.

### Confirmed drift / inconsistencies to resolve

1. **Public activation vs implemented workflows**
   - `ticket` runner and policy exist, but ticket phrases are not present in `activation.triggers`.
   - `release` runner exists and implements a full release orchestrator, but `release` is not currently a public activation family.
   - `workflow` runner exists as an internal dispatcher and should not be presented as a public trigger unless deliberately promoted.

2. **`prepare release` ambiguity**
   - The phrase is currently owned by `ship`, while a distinct full release orchestrator exists.
   - Decide and document whether `prepare release` means `ship` or the composite `release` workflow. Do not leave the phrase ambiguous.

3. **`preflight` usage is not formalised**
   - `preflight` is already an internal workflow-stage concept and is used operationally as a pre-checkpoint/pre-publish quality check.
   - It is not currently a formal public trigger.

4. **Agent/docs/runtime catalogue drift**
   - Agent frontmatter, activation configuration, cheatsheet, runner inventory, and user-facing references are not perfectly aligned.
   - `hotfix` is activated but is not consistently represented in all agent-facing summaries.

5. **Adviser reference catalogue lag**
   - Adviser currently models a subset of the available TCTBP workflow surface.
   - It does not currently represent all newer workflow families such as release, hotfix, gates, version, rollback, ticket, scaffold, and the proposed preflight workflow.

6. **Adviser metadata/documentation drift**
   - Adviser `.tctbp/source.json` is pinned to TCTBP-Web v0.3.6 / `78b75fc...`.
   - Adviser README text still refers to an older pinned TCTBP-Web commit.
   - Current TCTBP-Web advertises an Adviser capability set that includes `version-files.multi-format-v1`; Adviser source metadata should be checked for capability alignment.

These findings must be re-verified locally before implementation. Treat this section as a starting hypothesis list, not permission to make blind changes.

---

## Non-Negotiable Boundaries

### Canonical ownership

- TCTBP-Web owns generic workflow semantics, trigger vocabulary, safety rules, runner behaviour, contract vocabulary, managed-file inventory, and distribution mechanisms.
- A target repository owns project-specific commands, version sources, deployment mechanics, branch names where configurable, paths, environment details, documentation paths, and intentional deviations.
- Adviser owns presentation, repository inspection, recommendation logic, compatibility interpretation, user education, and guarded upgrade UX.

### Safety

- Do not rewrite Git history.
- Do not use force push as part of normal consolidation work.
- Do not use reset/rebase/stash/destructive checkout as a convenience mechanism.
- Do not allow Adviser to execute target policy command strings or target workflow runners.
- Do not let scaffold/reconcile overwrite project-owned values wholesale.
- Do not delete managed files without an explicit migration rule and approval path.
- Do not modify production application repositories merely to prove this architecture unless explicitly selected as a later proving ground.

### Work isolation

- Make TCTBP-Web changes on a dedicated non-`main` branch.
- Make Adviser changes on a dedicated non-environment branch.
- Keep each logical phase independently reviewable.
- Run verification before checkpointing or publishing each phase.

---

## Definition of Done

This consolidation is complete when all of the following are true:

1. A machine-readable canonical workflow catalogue exists in TCTBP-Web.
2. Every public workflow has one unambiguous identity and one unambiguous trigger/alias set.
3. Public workflows are distinguishable from internal runners and helper modules.
4. Every public trigger resolves to an installed, policy-enabled workflow or an explicitly documented special command such as parameterised branch handling.
5. No public alias is owned by more than one workflow.
6. TCTBP-Web tests fail if activation, workflow definitions, runners, scaffold inventory, contract metadata, or public documentation drift.
7. Scaffold and reconcile use the same canonical managed-surface definition or are mechanically checked against one another.
8. New repositories receive the current public workflow contract.
9. Existing TCTBP-enabled repositories can be assessed and safely reconciled to the current managed surface without overwriting project-owned settings.
10. Adviser consumes or validates against the canonical workflow contract rather than independently redefining TCTBP semantics.
11. Adviser clearly separates:
    - observed repository state;
    - deterministic recommendation;
    - user-selected intent plan;
    - workflow reference/explanation;
    - upgrade/scaffold health.
12. Adviser and repo-local Copilot describe the same workflow effects, non-effects, restrictions, aliases, and guardrails.
13. Version/capability drift between TCTBP-Web and Adviser is detectable and clearly reported.
14. `preflight` has a deliberate, tested contract if retained as a public workflow.
15. `release`, `ticket`, `prepare release`, `workflow`, and `hotfix` inconsistencies are resolved deliberately rather than cosmetically.

---

# Workstream A - Canonical TCTBP Workflow Contract

## A1. Inventory the actual workflow surface

Build a table from source, not documentation assumptions.

For every candidate workflow capture:

- workflow ID;
- public/internal/composite classification;
- display name;
- purpose;
- aliases / explicit triggers;
- parameterised command pattern, where applicable;
- runner path;
- whether a runner is required;
- dry-run/preview behaviour;
- branch restrictions;
- preconditions;
- local effects;
- remote effects;
- explicit non-effects;
- guardrail IDs;
- related workflows;
- applicable branch strategies;
- whether it is scaffold-managed;
- whether it appears in the Adviser contract;
- whether it should appear in Adviser UI/reference.

Candidate families to audit include at least:

- status
- preflight
- checkpoint
- publish
- handover
- handover local
- resume
- orient
- branch
- promote
- deploy
- ship
- release
- hotfix
- gate
- version
- rollback
- abort
- ticket
- scaffold
- workflow dispatcher

Do not infer public status merely because a runner file exists.

## A2. Decide workflow classifications

Recommended starting classifications:

### Public workflows

- status
- preflight, if formalised
- checkpoint
- publish
- handover
- resume
- orient
- branch
- promote
- deploy
- ship
- release
- hotfix
- gate
- version
- rollback
- abort
- ticket
- scaffold

### Internal infrastructure

- workflow dispatcher
- runtime helpers
- Git operation helpers
- release state/resume helpers
- promotion safety helpers
- candidate guards
- output/profile/status model helpers

Do not implement these classifications until their consequences for scaffold, Adviser, tests, and backward compatibility are reviewed.

## A3. Resolve disputed trigger semantics

### `release`

Decide whether to expose the existing composite release runner as a first-class public workflow.

Preferred model:

- `ship` = create/publish the formal production release from the configured production branch.
- `release` = orchestrate the complete configured environment pipeline that may include deploy, promote, ship, and final production deploy.

If adopted, add explicit release triggers such as:

- `release`
- `release please`
- `prepare release`
- `prepare release please`

### `prepare release`

Do not allow the phrase to remain owned ambiguously.

If `release` becomes public, strongly consider moving `prepare release` from `ship` to `release` and documenting this as a behavioural compatibility change.

### `ticket`

If ticket management is intended to be public, ensure its preferred triggers are activated and tested.

Suggested families:

- `ticket create`
- `ticket report`
- `ticket triage`

Decide separately whether bare `ticket` should open an interactive routing flow.

### `workflow`

Keep as internal unless there is a compelling operator-facing use case. The existence of a dispatcher is not sufficient reason to expose it.

### `hotfix`

Ensure all public references and agent metadata consistently include hotfix when the workflow is enabled.

---

# Workstream B - Formalise `preflight`

## B1. Purpose

`preflight` should answer:

> Is the current working state healthy enough to preserve, publish, hand over, promote, deploy, or otherwise advance?

It should be a **non-mutating aggregate verification workflow**.

## B2. Recommended behaviour

Run applicable configured checks against the current working state, including uncommitted changes:

1. Git/repository sanity inspection.
2. Active-operation/conflict detection.
3. Test gate when configured.
4. Lint gate when configured.
5. Build gate when configured.
6. Format/check diagnostics when configured and non-mutating.
7. Relevant editor/static diagnostics if available through a deterministic project-owned gate.
8. Working-tree state before and after verification.
9. Detect unexpected modifications caused by verification commands.
10. Produce a concise PASS / FAIL / NOT-CONFIGURED summary.

## B3. Required non-effects

A normal preflight must not:

- commit;
- push;
- tag;
- merge;
- switch branch;
- deploy;
- bump version;
- create release state;
- modify remote state.

If a configured gate itself writes files, preflight must detect and report that side effect rather than silently accepting it.

## B4. Relationship to other workflows

```text
code changes
     |
     v
  preflight
     |
     +----------+-----------+
     v          v           v
 checkpoint  publish     handover
```

Keep individual `gate test`, `gate lint`, and `gate build` operations available for targeted diagnostics.

Do not turn checkpoint into an implicit full quality-gate workflow unless that is separately and deliberately decided. Checkpoint and preflight have different responsibilities: preservation vs verification.

---

# Workstream C - Eliminate Trigger and Catalogue Drift

## C1. Establish one canonical catalogue

Prefer a structure where each public workflow owns its aliases and machine-readable behaviour metadata.

Avoid maintaining logically independent copies of the same trigger list in multiple places.

Possible models:

### Model 1 - Workflow-owned aliases with derived activation catalogue

Each workflow contains its own public aliases. `activation.triggers` is generated or validated from them.

### Model 2 - Central public workflow catalogue

A single `workflows` object contains all public workflow metadata and the runtime reads from it.

Evaluate migration cost before selecting a model.

## C2. Required consistency assertions

Add automated tests for at least:

- every public alias is activated;
- every activated phrase resolves to exactly one public workflow;
- no alias is owned by two workflows;
- every public runner path exists;
- internal runners are not accidentally advertised as public triggers;
- parameterised branch command routing is explicitly covered;
- target aliases such as prod/production and review/staging are strategy-aware;
- agent metadata recognises every public workflow family;
- cheatsheet workflow families correspond to canonical public workflows;
- scaffold managed inventory contains all required managed runner/contract files;
- no obsolete managed file remains advertised without migration handling.

## C3. Documentation role

Documentation should explain the canonical contract, not redefine it.

Where practical, generate or test selected documentation tables against the canonical machine-readable catalogue.

---

# Workstream D - Scaffold and Reconcile as One Distribution System

## D1. Define managed-surface ownership once

Today scaffold owns explicit arrays such as runner, GitHub, prompt, and contract inventories.

The target architecture should ensure these inventories are reused or validated by:

- scaffold;
- reconcile/upgrade;
- Adviser scaffold-health checks;
- Adviser upgrade planning;
- `.tctbp/source.json` generation;
- contract/capability reporting.

Prefer a reusable managed-surface manifest/module over several manually maintained lists.

## D2. Scaffold guarantees

A freshly scaffolded project should receive:

- canonical managed runtime files;
- correct TCTBP profile/schema version;
- correct public workflow catalogue;
- correct agent entry point;
- correct cheatsheet/reference material;
- current Adviser contract/schema/fixtures where applicable;
- source metadata sufficient to assess future drift;
- working placeholder verification appropriate to the chosen framework/test setup.

Add a scaffold smoke/integration test that proves the resulting project advertises the same intended public workflow contract as the source version.

## D3. Reconcile guarantees

Reconcile an existing repository by ownership boundary:

### Canonical-managed

May be replaced or migrated from the trusted source when policy permits.

### Project-owned

Must be preserved unless an explicit migration rule says otherwise.

### Merged configuration

Must use deterministic migration logic, not wholesale overwrite.

### Obsolete managed files

Require an explicit migration/deletion rule and operator approval where appropriate.

## D4. Reconcile implementation maturity review

Determine whether generic reconciliation is currently sufficiently deterministic or still primarily prompt/agent-driven.

If prompt-driven behaviour remains significant, decide whether the next architectural step should be a deterministic reconcile runner/plan format that Adviser and Copilot can both consume.

Do not build this runner merely for symmetry. First document concrete failure modes that determinism would solve.

---

# Workstream E - Adviser Contract and Compatibility

## E1. Reconcile current contract facts

Verify:

- current TCTBP-Web Adviser contract major/minor;
- current capability identifiers;
- schema path;
- profile schema version;
- workflow catalogue fields emitted by status JSON;
- source version/revision metadata expected in downstream repositories.

Compare these with Adviser:

- `.tctbp/source.json`;
- README pin text;
- contract fixtures;
- schema copies;
- reference catalogue source revision;
- compatibility logic;
- UI capability handling.

Correct only after the authoritative source revision for the upgrade is pinned.

## E2. Preserve compatibility semantics

- Reject unsupported contract major versions.
- Ignore unknown additive fields.
- Degrade by missing capability rather than treating every absence as unsafe.
- Keep TCTBP profile schema version distinct from Adviser contract version.
- Clearly distinguish configured, observed, absent, malformed, stale, unsupported, and unobserved evidence.

## E3. Extend contract only when necessary

Do not expose fields simply because Adviser wants them.

Add contract fields/capabilities when they represent stable, portable TCTBP facts that multiple consumers can reasonably use.

Possible areas to evaluate:

- richer public workflow catalogue metadata;
- managed-surface/source revision metadata;
- version-file capability details;
- workflow classification;
- preflight availability;
- release/hotfix/ticket capabilities;
- optional migration/upgrade metadata.

Bump contract minor for additive fields/capabilities; major only for breaking compatibility.

---

# Workstream F - TCTBP-Adviser Reference Model

## F1. Remove independent semantic drift

Adviser currently contains a hand-authored `WORKFLOW_REFERENCES` catalogue.

Determine which fields should be:

- read directly from TCTBP-Web contract/profile metadata;
- generated at Adviser build/update time from a pinned canonical source;
- retained as Adviser-specific explanatory UX text;
- validated against the canonical source by tests.

Preferred split:

### Canonical facts

- workflow ID;
- aliases;
- runner identity;
- enabled/installed state;
- branch restrictions;
- preconditions where portable;
- local/remote effects;
- non-effects;
- guardrail identifiers;
- relationships/capabilities.

### Adviser-owned presentation

- human-friendly wording;
- grouping/category labels;
- educational descriptions;
- UI ordering;
- contextual explanations;
- recommendation rationale presentation.

## F2. Expand the reference surface

Once the canonical contract is settled, ensure Adviser can represent every intended public workflow, including as applicable:

- preflight
- release
- hotfix
- gates
- version
- rollback
- ticket
- scaffold
- orient
- handover local semantics

Do not expose internal dispatcher/helper runners as user workflows.

---

# Workstream G - Adviser Recommendation and Intent Model

Adviser should answer four different questions without blending them.

## G1. Observation

**What state is the repository actually in?**

Use bounded, fixed-argument local Git observations and separately timestamped provider evidence.

## G2. Recommendation

**Given the observed state, what is the safest likely next workflow?**

Examples to test:

- dirty working tree -> preflight/checkpoint path;
- clean branch ahead of origin -> publish or handover depending intent/context;
- branch behind -> resume/sync;
- divergence/active operation -> abort/inspection;
- verified development candidate -> promote pre-production;
- verified pre-production candidate -> promote production;
- promoted production candidate -> ship;
- shipped production branch -> deploy production where configured;
- TCTBP managed-surface drift -> upgrade/reconcile recommendation.

Recommendations must remain deterministic and evidence-bound.

## G3. Intent plan

**What does the user want to achieve?**

Intent is separate from recommendation. A user may choose machine transfer, preservation, release, deployment, or recovery even when another state-driven recommendation exists.

Intent plans should show workflows and consequences but must not execute them from Adviser.

## G4. Reference explanation

**What will this workflow do and not do?**

The reference view should use the same canonical workflow contract as repo-local Copilot.

---

# Workstream H - Cross-Repo Upgrade Orchestration

The work should be orchestrated from TCTBP-Web in this sequence.

## Phase 0 - Local preflight and orientation

Before editing either repository:

1. Confirm both local repository paths.
2. Confirm current branches and remotes.
3. Confirm clean working trees.
4. Confirm no active Git operation.
5. Fetch/inspect origin state using the normal TCTBP safety model.
6. Record current TCTBP-Web source revision and version.
7. Record Adviser source revision, version, `.tctbp/source.json`, contract version, and capabilities.
8. Run existing tests in both repositories.
9. Create dedicated work branches if not already created.

Stop on dirty/diverged/ambiguous state.

## Phase 1 - Canonical contract audit only

Do not change semantics yet.

Produce a machine-readable or Markdown audit matrix showing:

- configured activation phrases;
- preferred workflow aliases;
- runners;
- public/internal classification proposal;
- scaffold inventory;
- agent metadata;
- cheatsheet representation;
- Adviser reference representation;
- Adviser contract capability representation.

Acceptance gate: every discrepancy is explicitly classified as bug, intentional difference, backward-compatibility alias, or future enhancement.

## Phase 2 - TCTBP-Web consistency hardening

Implement only the consistency framework first:

- canonical workflow catalogue structure or validation layer;
- no-duplicate trigger ownership tests;
- alias-to-activation consistency tests;
- runner existence tests;
- scaffold managed-surface consistency tests;
- agent/docs consistency checks where practical.

Acceptance gate: tests catch the currently known discrepancies before semantic fixes are applied, where feasible.

## Phase 3 - Workflow semantic decisions

Resolve individually:

1. formal `preflight`;
2. public `release`;
3. `prepare release` ownership;
4. ticket activation;
5. workflow dispatcher internal/public classification;
6. hotfix catalogue alignment;
7. bare promote/deploy behaviour and explicit-target handling;
8. polite alias policy (`please`) and whether it should remain enumerated or normalised.

Do not bundle all semantic changes into one opaque edit. Each decision should have explicit tests.

## Phase 4 - Scaffold/reconcile propagation

Update managed-surface/distribution logic so new and existing repositories receive the same canonical contract.

Acceptance gate:

- fresh scaffold passes;
- reconcile dry-run/plan correctly identifies expected additions/replacements/preserved values;
- no project-specific values are silently overwritten;
- source metadata records the canonical revision/version/capabilities.

## Phase 5 - Adviser contract upgrade

Pin Adviser upgrade work to the exact verified TCTBP-Web source revision after Phase 4.

Update contract/schema/fixtures only as required by deliberate canonical changes.

Acceptance gate:

- existing supported contract fixtures remain compatible where promised;
- new capabilities are additive;
- source revision metadata is exact;
- no DDRE-specific behaviour enters the generic contract.

## Phase 6 - Adviser reference/recommendation alignment

Update Adviser so its workflow reference and recommendation systems understand the new canonical surface.

Acceptance gate:

- workflow list matches intended public canonical workflows;
- aliases/effects/non-effects/guardrails match canonical truth;
- Adviser remains non-executing for target workflows;
- recommendation and intent tests cover preflight/release/upgrade scenarios;
- README/source metadata/reference revision agree.

## Phase 7 - End-to-end proving exercise

Use controlled fixture repositories or throwaway scaffold output first.

Test:

1. scaffold a new project;
2. inspect it with Adviser;
3. verify workflow catalogue agreement;
4. simulate managed-surface drift;
5. confirm Adviser detects drift;
6. generate an upgrade plan;
7. apply only explicitly approved managed-file changes in the safe Adviser/update path if that capability is being tested;
8. verify Copilot in the target repo recognises the same workflow set;
9. verify no application-owned configuration is lost.

Only after this passes should a real production-linked repository be considered as a proving ground.

---

# Workstream I - Environment and Handover Metadata

Because TCTBP is used across multiple machines, add environment-awareness without making machine configuration part of the canonical runtime contract unnecessarily.

## I1. Development tech-stack summary

Consider adding a concise, generated/verified tech-stack section to handover continuation files containing only useful development context such as:

- OS/runtime context;
- Node version;
- npm version;
- Python version where relevant;
- package manager;
- framework/build tool;
- key configured quality gates;
- dev server command/port where configured;
- repo-relative setup instructions;
- last verification date.

Prefer values derived from project files/runtime inspection over freehand prose.

## I2. Source-of-truth hierarchy

Environment handover notes are advisory.

Authoritative project version/tooling should remain in project-controlled files such as package metadata, lock files, Node version files, Python dependency files, and documented setup files.

---

# Testing Strategy

## TCTBP-Web

At minimum verify:

- existing unit suite;
- canonical JSON parses without duplicate keys;
- public workflow catalogue uniqueness;
- activation/alias consistency;
- runner existence;
- internal/public classification;
- scaffold managed-surface consistency;
- scaffold dry-run;
- scaffold end-to-end into a temporary directory;
- generated profile correctness for simple, staged, and long-lived strategies;
- status Adviser JSON/schema fixtures;
- release/hotfix/ticket/preflight tests as applicable;
- `git diff --check`;
- Node syntax checks for changed runner files where useful.

## TCTBP-Adviser

At minimum verify:

- `npm test`;
- `npm run typecheck`;
- `npm run build`;
- Adviser contract fixtures;
- reference catalogue tests;
- recommendation tests;
- intent plan tests;
- scaffold-health/upgrade-plan tests;
- source revision/capability alignment;
- local-only/read-only security tests;
- no target policy command execution;
- no leaking repository paths or command strings to the browser.

---

# Recommended Commit/Checkpoint Structure

Keep changes reviewable. Suggested logical checkpoints:

1. `docs: record canonical workflow audit`
2. `test: enforce public workflow catalogue consistency`
3. `feat: formalise preflight workflow`
4. `feat: align release and trigger semantics`
5. `fix: activate ticket and align hotfix metadata`
6. `refactor: unify managed TCTBP surface inventory`
7. `test: verify scaffold and reconcile propagation`
8. `chore: bump Adviser contract capability metadata` if required
9. Adviser: `refactor: consume canonical workflow catalogue`
10. Adviser: `feat: expose expanded TCTBP workflow reference`
11. Adviser: `test: align recommendations and upgrade compatibility`
12. `docs: align ecosystem reference and source metadata`

Actual checkpoint boundaries should follow the final implementation shape, not this list mechanically.

---

# Decision Log Required During Work

Maintain a short decision log in this plan or a companion file for decisions that alter public behaviour.

Required decisions include:

| Decision | Options | Selected | Compatibility impact |
|---|---|---|---|
| Is `preflight` public? | yes / no | TBD | TBD |
| Does `prepare release` mean ship or release? | ship / release | TBD | TBD |
| Is `release` public? | yes / no | TBD | TBD |
| Are ticket commands public triggers? | yes / no | TBD | TBD |
| Is `workflow` internal only? | yes / no | TBD | TBD |
| Keep enumerated `please` aliases? | enumerate / normalise | TBD | TBD |
| Canonical catalogue location | existing policy / new section/module | TBD | TBD |
| Managed-surface source | scaffold arrays / shared manifest | TBD | TBD |
| Adviser catalogue strategy | runtime contract / generated / validated static | TBD | TBD |

Do not make compatibility-sensitive choices silently.

---

# Copilot Orchestration Instructions

When using this plan from within TCTBP-Web, Copilot should work as an orchestrator, not as an uncontrolled cross-repo editor.

## Before each phase

1. Read this plan.
2. Read current `.github/TCTBP.json` and TCTBP agent guidance.
3. Inspect relevant source files before proposing edits.
4. Inspect the current target repository state before touching Adviser.
5. State the exact phase and acceptance gate being worked on.
6. Prefer read-only analysis first.
7. Show material discrepancies before changing them.

## During each phase

- Make the smallest coherent change that advances the phase.
- Add or update tests before relying on documentation.
- Preserve target-specific values.
- Do not opportunistically refactor unrelated code.
- Do not upgrade dependencies unless required and explicitly justified.
- Do not commit/publish merely because edits are complete; follow TCTBP preflight/checkpoint/publish rules.

## At the end of each phase

Report:

- files changed;
- decisions made;
- tests run and results;
- contract/schema/version impact;
- scaffold/reconcile impact;
- Adviser impact;
- backward-compatibility impact;
- remaining discrepancies;
- recommended next phase.

---

# First Session Checklist

When resuming this work, start here:

1. Run `status` on TCTBP-Web.
2. Run the existing test suite without changing code.
3. Confirm the current TCTBP-Web revision/version.
4. Locate the local TCTBP-Adviser checkout and run its status/tests read-only.
5. Re-verify the discrepancy list in this document against local source.
6. Produce the Phase 1 canonical workflow audit matrix.
7. Do **not** implement `preflight`, change `prepare release`, or alter Adviser until the audit matrix is complete.
8. Review the decision-log items with the operator.
9. Then proceed to Phase 2 consistency hardening.

---

## Success Criterion

The project succeeds when a repository manager can open Adviser and receive trustworthy guidance about repository state, compatibility, upgrades, and the correct next TCTBP workflow, while a developer inside the same repository can invoke that workflow through Copilot and receive the **same canonical behaviour, terminology, safety guarantees, and effects**.

TCTBP-Web should define the truth. Scaffold and reconcile should distribute it. Copilot should execute it locally. Adviser should explain and manage it safely.
