---
description: Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts.
argument-hint: "Optional: phase number, task ID range, or --dry-run (e.g. 'Phase 2', 'T010-T020', '--dry-run')"
model: ['Claude Sonnet 4.5 (copilot)', 'Auto (copilot)']
target: vscode
user-invocable: false
tools: ['run_in_terminal', 'read_file', 'github/github-mcp-server/issue_write']
handoffs:
  - label: Implement Project
    agent: speckit.implement
    prompt: Start the implementation in phases
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before issue creation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_tasks` key.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
1. From the executed script, extract the path to **tasks**.
1. Get the Git remote by running:

```bash
git config --get remote.origin.url
```

> [!CAUTION]
> ONLY PROCEED TO NEXT STEPS IF THE REMOTE IS A GITHUB URL

1. Parse `$ARGUMENTS` to determine scope and mode:
   - If a phase label is present (e.g. `Phase 2`), filter tasks to that phase only.
   - If a task ID range is present (e.g. `T010-T020`), filter tasks to that ID range only.
   - If `--dry-run` is present, set dry-run mode ON — **do not call `issue_write` at any point**.
   - If no arguments are given, convert all tasks.

1. **Dry-run mode**: If `--dry-run` is active, print the following table for every task in scope and then stop — do not proceed to issue creation:

   | Task ID | Issue Title | Labels | Depends On |
   |---------|-------------|--------|------------|
   | T001    | …           | …      | —          |
   | T002    | …           | …      | T001       |

   After printing the table, output:
   ```
   Dry-run complete. No issues were created. Remove --dry-run to write issues to GitHub.
   ```

1. For each task in scope (when **not** in dry-run mode), use the GitHub MCP server to create a new issue in the repository that matches the Git remote. Each issue must include:
   - **Title**: task description
   - **Body**: acceptance criteria, exact file paths, and dependency task IDs (e.g. "Depends on T001, T003")
   - **Labels**: phase label + any story labels present on the task (e.g. `phase-2`, `US1`)

> [!CAUTION]
> UNDER NO CIRCUMSTANCES EVER CREATE ISSUES IN REPOSITORIES THAT DO NOT MATCH THE REMOTE URL

## Post-Execution Hooks

After all issues are created (or after a dry-run), check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_tasks` key.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.
