# Repository agent instructions

## Shared code and documentation policy

This repository adopts shared-development-policy 1.0.0. Read
`.github/DEVELOPMENT_POLICY.md` and its machine-readable companion
`.github/development-policy.json` for code, configuration and documentation work.
Use `node scripts/check-modularity.cjs --changed` for advisory size signals.
Record design reviews for new or materially changed large files in change notes.
File size alone never requires a split or grants approval to commit or publish.
Existing correctness, security, Git and approval protections remain in force.

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
