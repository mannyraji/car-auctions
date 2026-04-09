---
agent: speckit.taskstoissues
description: Convert tasks in the active feature spec into GitHub issues, preserving dependency order and acceptance criteria.
---

Convert the active feature's `tasks.md` into GitHub issues in the current repository.

Each task becomes one issue with its title, labels, and dependency references preserved. Issues are created in dependency order so blocking tasks are always numbered before the tasks that depend on them.

**Arguments (`$ARGUMENTS`)**: Optionally pass a phase number, task ID range, or `--dry-run` to control scope:
- `Phase 2` — only convert tasks in Phase 2
- `T010-T020` — only convert tasks with IDs T010 through T020
- `--dry-run` — preview the issues that *would* be created without writing anything to GitHub

When `--dry-run` is active the agent prints a markdown table of all would-be issues (title, labels, dependency task IDs) and exits without calling the GitHub API.

```text
$ARGUMENTS
```
