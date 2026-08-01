# Codex session packet

Use one packet per bounded objective. The main planning thread owns
architecture, prioritization, integration review, and promotion decisions.

## Session

- Session ID:
- Objective:

## Repository and isolation

- Repository:
- Worktree:
- Branch:
- Base commit:

## Required reading

- [ ]

## Scope

Allowed:

- [ ]

Out of scope:

- [ ]

## Invariants and contract boundaries

- [ ]

## Acceptance commands

    # Run focused checks for this objective.

## Commit expectations

- Make one implementation commit for this session.
- Do not merge, push, rebase, or modify another checkout unless explicitly
  authorized.
- Keep generated files, dependencies, schemas, and fixtures out of scope
  unless the objective explicitly includes them.

## Handoff

- Commit SHA:
- Files changed:
- Tests/acceptance commands and results:
- Decisions:
- Risks/blockers:
- Next input:

Do not fork a full conversation history for a bounded task. Keep one
repository and one objective per session unless an explicitly authorized
cross-repo task requires otherwise.
