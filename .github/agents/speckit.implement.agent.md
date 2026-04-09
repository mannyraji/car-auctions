---
description: Execute the implementation plan by processing and executing all tasks defined in tasks.md
argument-hint: "Optional: GitHub issue URL or '#N' (e.g. '#42'). Combine with phase/task filter: '#42 Phase 2'"
tools: ['run_in_terminal', 'read_file', 'editFiles', 'search', 'github.vscode-pull-request-github/issue_fetch', 'github.vscode-pull-request-github/activePullRequest']
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## GitHub Issue Context

Before running prerequisite checks, resolve any GitHub issue reference in `$ARGUMENTS`:

1. Scan `$ARGUMENTS` for a GitHub issue reference in any of these forms:
   - Full URL: `https://github.com/<owner>/<repo>/issues/<N>`
   - Shorthand: `#<N>` or bare integer `<N>` (only when `$ARGUMENTS` starts with `#` or a digit)
2. If a reference is found:
   - Strip the reference from `$ARGUMENTS`; retain the remainder (e.g. `"Phase 2"`) for downstream phase/task filtering.
   - Store the issue number as `GITHUB_ISSUE_NUMBER`.
   - Call `github-pull-request_issue_fetch` with the extracted issue number.
   - Display the fetched issue as a context block:
     ```
     ### Issue Context: #{GITHUB_ISSUE_NUMBER} — {title}
     {body}
     ```
   - Use this context to resolve ambiguous requirement intent throughout the outline. It does **not** override local spec artifacts.
3. If no reference is found, or the fetch fails for any reason, set `GITHUB_ISSUE_NUMBER` to empty and continue silently.

## Pre-Execution Checks

**Check for extension hooks (before implementation)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_implement` key
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
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
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Check checklists status** (if FEATURE_DIR/checklists/ exists):
   - Scan all checklist files in the checklists/ directory
   - For each checklist, count:
     - Total items: All lines matching `- [ ]` or `- [X]` or `- [x]`
     - Completed items: Lines matching `- [X]` or `- [x]`
     - Incomplete items: Lines matching `- [ ]`
   - Create a status table:

     ```text
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | ✓ PASS |
     | test.md   | 8     | 5         | 3          | ✗ FAIL |
     | security.md | 6   | 6         | 0          | ✓ PASS |
     ```

   - Calculate overall status:
     - **PASS**: All checklists have 0 incomplete items
     - **FAIL**: One or more checklists have incomplete items

   - **If any checklist is incomplete**:
     - Display the table with incomplete item counts
     - **STOP** and ask: "Some checklists are incomplete. Do you want to proceed with implementation anyway? (yes/no)"
     - Wait for user response before continuing
     - If user says "no" or "wait" or "stop", halt execution
     - If user says "yes" or "proceed" or "continue", proceed to step 3

   - **If all checklists are complete**:
     - Display the table showing all checklists passed
     - Automatically proceed to step 3

3. Load and analyze the implementation context:
   - **REQUIRED**: Read tasks.md for the complete task list and execution plan
   - **REQUIRED**: Read plan.md for tech stack, architecture, and file structure
   - **IF EXISTS**: Read data-model.md for entities and relationships
   - **IF EXISTS**: Read contracts/ for API specifications and test requirements
   - **IF EXISTS**: Read research.md for technical decisions and constraints
   - **IF EXISTS**: Read quickstart.md for integration scenarios
   - **IF `GITHUB_ISSUE_NUMBER` is set**: Treat the fetched issue title and body as supplemental context when interpreting tasks.md and plan.md. Use it to resolve ambiguous requirement intent — it does not override local spec artifacts.

4. **Project Setup Verification**:
   - **REQUIRED**: Create/verify ignore files based on actual project setup:

   **Detection & Creation Logic**:
   - Check if the following command succeeds to determine if the repository is a git repo (create/verify .gitignore if so):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Check if Dockerfile* exists or Docker in plan.md → create/verify .dockerignore
   - Check if .eslintrc* exists → create/verify .eslintignore
   - Check if eslint.config.* exists → ensure the config's `ignores` entries cover required patterns
   - Check if .prettierrc* exists → create/verify .prettierignore
   - Check if .npmrc or package.json exists → create/verify .npmignore (if publishing)
   - Check if terraform files (*.tf) exist → create/verify .terraformignore
   - Check if .helmignore needed (helm charts present) → create/verify .helmignore

   **If ignore file already exists**: Verify it contains essential patterns, append missing critical patterns only
   **If ignore file missing**: Create with full pattern set for detected technology

   **Common Patterns by Technology** (from plan.md tech stack):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `*.dll`, `autom4te.cache/`, `config.status`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Tool-Specific Patterns**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Parse tasks.md structure and extract:
   - **Task phases**: Setup, Tests, Core, Integration, Polish
   - **Task dependencies**: Sequential vs parallel execution rules
   - **Task details**: ID, description, file paths, parallel markers [P]
   - **Execution flow**: Order and dependency requirements

5.5. **Draft PR Creation** (GitHub only — skip entirely if the remote is not a GitHub URL):

   a. Verify this is a GitHub repository:
      ```sh
      git config --get remote.origin.url 2>/dev/null
      ```
      If the remote URL does not contain `github.com`, skip this step entirely.

      Verify the `gh` CLI is available before proceeding:
      ```sh
      command -v gh >/dev/null 2>&1
      ```
      If `gh` is not found, print `"gh CLI not found — skipping draft PR creation"` and skip the rest of step 5.5.

   b. Check for an existing open PR on the current branch:
      ```sh
      gh pr view --json number,title,state 2>/dev/null
      ```
      - If a PR exists: store its number as `GITHUB_PR_NUMBER` and display the PR URL. Do not create a new one.
      - If no PR exists: proceed to step c.

   c. Create a draft PR:
      - Use the issue title as the PR title when `GITHUB_ISSUE_NUMBER` is set: `feat: {issue title}`. Otherwise use `feat: {FEATURE_DIR basename}`.
      - Compose the PR body (omit the `Closes #...` line entirely if `GITHUB_ISSUE_NUMBER` is empty):
        ```
        Implements {FEATURE_DIR}

        Closes #{GITHUB_ISSUE_NUMBER}

        ## Planned Tasks
        {bulleted list of task IDs and descriptions from tasks.md}
        ```
      - Execute: `gh pr create --draft --title "..." --body "..."`
      - Store the returned PR number as `GITHUB_PR_NUMBER` and display the PR URL.

6. Execute implementation following the task plan:
   - **Phase-by-phase execution**: Complete each phase before moving to the next
   - **Respect dependencies**: Run sequential tasks in order, parallel tasks [P] can run together  
   - **Follow TDD approach**: Execute test tasks before their corresponding implementation tasks
   - **File-based coordination**: Tasks affecting the same files must run sequentially
   - **Validation checkpoints**: Verify each phase completion before proceeding

7. Implementation execution rules:
   - **Setup first**: Initialize project structure, dependencies, configuration
   - **Tests before code**: If you need to write tests for contracts, entities, and integration scenarios
   - **Core development**: Implement models, services, CLI commands, endpoints
   - **Integration work**: Database connections, middleware, logging, external services
   - **Polish and validation**: Unit tests, performance optimization, documentation

8. Progress tracking and error handling:
   - Report progress after each completed task
   - Halt execution if any non-parallel task fails
   - For parallel tasks [P], continue with successful tasks, report failed ones
   - Provide clear error messages with context for debugging
   - Suggest next steps if implementation cannot proceed
   - **IMPORTANT** For completed tasks, make sure to mark the task off as [X] in the tasks file.
   - **Commit linking** (when `GITHUB_ISSUE_NUMBER` is set): After each completed task group, display a recommended commit message template using the resolved issue number (e.g. `42`, not the literal string `GITHUB_ISSUE_NUMBER`):
     - For intermediate task groups: `git commit -m "feat: [description] (Part of #{resolved issue number)"`
     - For the final task group: `git commit -m "feat: [description] (Closes #{resolved issue number)"`
   - **Push tasks.md progress** (advisory — do not auto-execute): After marking tasks `[X]`, recommend:
     ```sh
     git add {FEATURE_DIR}/tasks.md && git commit -m "chore: mark {TASK_ID} complete" && git push
     ```
     This keeps task progress visible to the team on the remote branch.

9. Completion validation:
   - Verify all required tasks are completed
   - Check that implemented features match the original specification
   - Validate that tests pass and coverage meets requirements
   - Confirm the implementation follows the technical plan
   - Report final status with summary of completed work

Note: This command assumes a complete task breakdown exists in tasks.md. If tasks are incomplete or missing, suggest running `/speckit.tasks` first to regenerate the task list.

9.5. **GitHub PR Summary** (skip entirely if `GITHUB_PR_NUMBER` is not set):

   a. Call `github-pull-request_activePullRequest` to confirm the PR is still open and retrieve its current description.
      - If no active PR is returned, skip steps b and c silently.

   b. **Post completion comment**:
      Compose and post a Markdown comment:
      ```sh
      gh pr comment {GITHUB_PR_NUMBER} --body "{comment}"
      ```
      Comment template:
      ```markdown
      ## Implementation Complete

      **Feature**: {FEATURE_DIR basename}
      **Tasks completed**: {X} / {Y}
      **Phases run**: {comma-separated list}
      **Key files changed**: {list of primary file paths from tasks.md}
      **Tests**: {passed ✓ / failed ✗ / skipped —}
      **Issue**: #{GITHUB_ISSUE_NUMBER}
      ```
      Omit the **Issue** line if `GITHUB_ISSUE_NUMBER` is empty.

   c. **Append Implementation Summary to PR description** (idempotent):
      - Read the current PR body from the `activePullRequest` response.
      - If the body already contains the heading `## Implementation Summary`: skip — do not duplicate.
      - Otherwise append the block. Write the combined body to a temp file to avoid shell escaping issues with multiline content, quotes, or backticks, then execute:
        ```sh
        printf '%s\n\n## Implementation Summary\n\n%s' "$existing_body" "$summary" > /tmp/pr_body_$$.md
        gh pr edit {GITHUB_PR_NUMBER} --body-file /tmp/pr_body_$$.md
        rm -f /tmp/pr_body_$$.md
        ```

10. **Check for extension hooks**: After completion validation, check if `.specify/extensions.yml` exists in the project root.
    - If it exists, read it and look for entries under the `hooks.after_implement` key
    - If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally
    - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
    - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
      - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
      - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
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
    - If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently
