---
agent: speckit.implement
description: "Execute the implementation plan, optionally linked to a GitHub issue or PR"
argument-hint: "Optional: GitHub issue URL or '#N' (e.g. '#42'). Combine with phase/task filter: '#42 Phase 2'"
---

Implement the feature. $ARGUMENTS

> **GitHub Integration**: Pass a GitHub issue reference as part of `$ARGUMENTS` (e.g. `#42` or a full issue URL) to inject the issue title and body as supplemental spec context and automatically link commits and the PR to the issue. Non-issue arguments such as phase or task filters (e.g. `Phase 2`, `T010-T020`) continue to work alongside the issue ref.
