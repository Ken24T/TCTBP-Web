---
description: "Use when the user explicitly asks for reconcile-tctbp <absolute-target-repo-path> so the current repository can inspect another repository, detect whether it is new, missing the agent runtime, or already using the agent runtime, and then reconcile that repository's TCTBP state safely."
name: "reconcile-tctbp"
argument-hint: "Absolute target repository path, plus optional source ref, target state or AUTO, backup mode, and whether to include the hook layer"
agent: "agent"
---

# reconcile-tctbp

Use this prompt inside a repository that already uses TCTBP when you want Copilot to handle an explicit `reconcile-tctbp <absolute-target-repo-path>` request and install, adapt, or refresh the TCTBP workflow and optional agent runtime in a different repository.

## Goal

Apply the current repository's TCTBP runtime surface to a target repository safely so that Copilot can choose the correct path for one of three cases:

- a brand new repository with no TCTBP files yet
- an existing repository that has some TCTBP workflow files but no custom agent runtime
- an existing repository that already has the custom agent runtime and needs to be refreshed from the current source repository

Depending on the detected or requested state, the target repository should gain or retain:

- a custom TCTBP agent entry point
- a machine-readable workflow policy
- aligned Markdown workflow guidance
- deterministic Node.js runners for every workflow
- a staged or simple branch model
- code-loss prevention (safety tags, merge deletion audits, pre-push net-deletion checks)
- optional runtime hook enforcement for risky git commands
- an ignore rule that keeps local TCTBP file-backup artefacts out of normal commits

The current repository is the source of generic workflow logic and runner architecture.
The target repository is the source of repo-specific commands, paths, deployment details, and intentional local deviations.

## Required Inputs

```text
Source TCTBP repository path: <ABSOLUTE_CURRENT_REPOSITORY_PATH_OR_OTHER_SOURCE_REPO>
Target repository path: <ABSOLUTE_TARGET_REPO_PATH>
Target repository state: <AUTO_OR_NEW_REPOSITORY_OR_EXISTING_REPOSITORY_WITHOUT_AGENT_OR_EXISTING_REPOSITORY_WITH_AGENT>
Preferred install/update branch in target repo: <BRANCH_NAME_OR_NULL>
Include hook layer: <YES_OR_NO>
Backup mode for existing repo: <NONE_OR_BRANCH_ONLY_OR_BRANCH_AND_FILE_BACKUPS>
Source ref to use from this repository: <CURRENT_BRANCH_TAG_OR_COMMIT>
Any repo-specific settings that must be preserved exactly: <LIST_OR_NONE>
Any intentional local workflow deviations that must not be normalised away: <LIST_OR_NONE>
```

## What Must Be Customised In The Target Repository

Do not leave template-repo-specific values behind. Customise at least these categories:

- project name and description
- branch strategy (`"simple"` or `"staged"`) and working branch name
- format, test, lint, build, and release-build commands
- version files and version source rules
- deploy target details and post-deploy checks
- docs and runbook review paths
- locale or writing conventions
- branch naming preferences if the target repo uses them

## What You Must Not Do

Do not:
- overwrite existing target-repo workflow files wholesale without review
- guess unknown commands, version files, deploy steps, or docs paths
- install the hook layer without also installing its supporting script
- use stash, reset, rebase, force-push, or destructive checkout as part of the setup
- run checkpoint, SHIP, publish, deploy, or handover in the target repo unless explicitly requested

## Preferred Final Summary

When finished, report:
1. which source ref was used
2. which target repository path was updated
3. which files were created or updated in the target repo
4. which repo-specific values were intentionally customised or preserved
5. which target-repository state was detected or applied
6. whether the hook layer was installed and whether `node` was available
7. any unresolved values or follow-up checks

## Shared development policy distribution

Carry `.github/DEVELOPMENT_POLICY.md`, `.github/development-policy.json` and
`scripts/check-modularity.cjs` together from the canonical source. The target
profile references these files through `profile.developmentPolicy`. Merge the
shared policy entry into existing AGENTS/Copilot guidance without replacing
project-specific instructions or unrelated workflow guards. Remove superseded
mandatory line-count splits from current guidance; retain historical records.
Review reporter output with the shared policy; size alone is not a failure.

## TCTBP Codex skill names

For a Codex skill whose primary purpose is a TCTBP workflow action, set
`interface.display_name` in `agents/openai.yaml` to `TCTBP <Action>`.
Use readable action words and established acronym casing, for example
`TCTBP Begin`, `TCTBP Status`, `TCTBP Ticket Sync`, `TCTBP CI` and `TCTBP E2E`.
Both `status` and `tctbp-status` display as `TCTBP Status`; use the prefix once.
Identify ownership from the skill's invocation name and workflow purpose;
an incidental TCTBP mention does not make an unrelated skill part of TCTBP.
Apply the convention when creating, installing or refreshing TCTBP skills.
Preserve existing invocation names, descriptions, prompts, dependencies,
invocation policies, workflow instructions and runtime guards. Do not create
additional skills merely to apply this convention. Validate the labels and
confirm the other existing skill fields and workflow files are unchanged.

Carry this naming convention into the target repository's AGENTS guidance
without replacing its existing instructions or adding unsupported workflows.
