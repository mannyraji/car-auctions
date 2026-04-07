# Open Branch Status Overview

> Generated 2026-04-07. All branches target `main`.

There are **8 open branches** (7 with open PRs + the current one). They fall into three themes: **CI fixes**, **monorepo scaffolding / shared package**, and **full implementation**. Many overlap and some are superseded — see the recommendation at the bottom.

---

## CI-focused branches (3)

### `mannyraji-patch-1` → [PR #7](https://github.com/mannyraji/car-auctions/pull/7)
**"Refactor CI workflow for improved structure and clarity"**
- **Author:** mannyraji (manual edit)
- **Scope:** 1 file changed — `.github/workflows/basic.yml` (53 additions, 25 deletions, 6 commits)
- **What it does:** Rewrites the GitHub Actions CI workflow for better structure — adds lockfile detection, proper `setup-node` ordering, and npm caching.
- **Status:** Open, not draft, blocked (CI/review). Has 4 review comments. Overlaps with PRs #9 and #10.

### `copilot/fix-divergent-branches-issue` → [PR #9](https://github.com/mannyraji/car-auctions/pull/9)
**"Replace placeholder CI workflow with proper TypeScript monorepo CI"**
- **Author:** Copilot agent (triggered by a `git pull` divergent-branches error)
- **Scope:** 1 file changed — `.github/workflows/basic.yml` (16 additions, 19 deletions, 2 commits)
- **What it does:** Replaces the original `echo Hello, world!` placeholder workflow with a real Node.js 20 workflow: `npm ci`, `npm run build/lint/test --workspaces --if-present`.
- **Status:** Open, **draft**, blocked. Superseded by more complete CI implementations (PRs #7 and #10). Safe to close.

### `copilot/remove-unused-typescript-steps` → [PR #10](https://github.com/mannyraji/car-auctions/pull/10)
**"CI: Replace placeholder steps with conditional project-file detection"**
- **Author:** Copilot agent (triggered by a review comment that `tsc`/`npm test` would fail with no `package.json`)
- **Scope:** 1 file changed — `.github/workflows/basic.yml` (46 additions, 8 deletions, 2 commits)
- **What it does:** Adds a detection step that probes for `package.json`, `tsconfig.json`, ESLint config, and Prettier config, then gates every CI step on the relevant flag. CI passes cleanly with no config files and auto-activates as files are added.
- **Status:** Open, not draft, blocked. Overlaps with PRs #7 and #13. The approach is sound but the feature is now covered by PR #13.

---

## Monorepo scaffolding / shared package branches (3)

### `001-shared-utilities-lib` → [PR #8](https://github.com/mannyraji/car-auctions/pull/8)
**"Implement shared utilities library with documentation and tasks"**
- **Author:** mannyraji
- **Scope:** 15 files changed, 2551 additions, 42 deletions, 10 commits
- **What it does:** An early implementation of the `@car-auctions/shared` package — shared types, documentation (`docs/spec.md`, `docs/plan.md`), and task scaffolding. Also includes `docs/public-api.md` and a quality checklist.
- **Status:** Open, not draft, blocked. This PR's documentation content was merged into the `merge-local-changes` branch (PR #13) and its code is superseded by the fuller implementation in PR #12.

### `copilot/vscode-mnnoy4r4-wesl` → [PR #12](https://github.com/mannyraji/car-auctions/pull/12)
**"Bootstrap monorepo: add root package.json and implement @car-auctions/shared"**
- **Author:** Copilot agent (triggered by `npm install` failing with `ENOENT: no such file or directory, open package.json`)
- **Scope:** 33 files changed, 11,750 additions, 19 deletions, 5 commits
- **What it does:** The most complete implementation branch to date. Adds the full monorepo scaffold:
  - Root `package.json` (npm workspaces, build/lint/test scripts)
  - `tsconfig.base.json` (ES2022, Node16, strict)
  - `eslint.config.mjs` (ESLint 10 flat config + typescript-eslint + Prettier)
  - `.gitignore`
  - Complete `packages/shared` (`@car-auctions/shared`) with all 8 modules: types, errors, normalizer, VIN decoder, MCP helpers, browser pool, priority queue, tracing
  - 140 tests at 91.5% branch coverage
- **Status:** Open, not draft, blocked. **This is the highest-value branch** — it is the only one with a complete, tested `packages/shared` implementation.

### `merge-local-changes` → [PR #13](https://github.com/mannyraji/car-auctions/pull/13)
**"feat: shared utilities lib, CI fixes, and mannyraji-patch-1 merge"**
- **Author:** mannyraji
- **Scope:** 21 files changed, 7,696 additions, 54 deletions, 10 commits
- **What it does:** A consolidation branch created because `main` is protected and local commits couldn't be pushed directly. Bundles together:
  - Shared utilities library specification updates
  - `package-lock.json` initialization
  - Enhanced VIN decoder and normalizer specifications
  - CI workflow fixes from `mannyraji-patch-1`
- **Status:** Open, not draft, blocked. Acts as a merge point for mannyraji's local work. Partially superseded by PR #12 for code, but contains unique spec updates.

---

## Full implementation branches (1 + current)

### `copilot/implement-copilot-instructions` → [PR #16](https://github.com/mannyraji/car-auctions/pull/16)
**"[WIP] Start implementation for Copilot integration"**
- **Author:** Copilot agent (triggered by "Start implementation" prompt)
- **Scope:** 1 commit, minimal changes (ran out of budget before full work)
- **What it does:** A fresh attempt to implement all packages from scratch using the speckit planning/implementation agents. The PR description shows the full checklist: all 7 MCP server packages, the alerts service, and CI/CD workflows.
- **Status:** Open, **draft**, WIP. The agent explored the repository but hit its token budget before completing the implementation. This is not blocked by review — it just hasn't been finished yet.

### `copilot/explain-open-branches-status` → [PR #17](https://github.com/mannyraji/car-auctions/pull/17) ← *current branch*
**"Add explanation for open branches and their status"**
- **Author:** Copilot agent (triggered by "explain open branches" prompt)
- **Scope:** This document
- **Status:** In progress.

---

## Recommendation: what to do with all these branches

| Branch | Recommended action | Reason |
|---|---|---|
| `copilot/fix-divergent-branches-issue` (PR #9) | **Close** | Draft, superseded by every other CI branch |
| `mannyraji-patch-1` (PR #7) | **Merge or close** | The CI changes here are also in `merge-local-changes` (PR #13); pick one |
| `copilot/remove-unused-typescript-steps` (PR #10) | **Close** | Conditional-detection approach is sound but now covered |
| `001-shared-utilities-lib` (PR #8) | **Close** | Documentation content rolled into PR #13; code superseded by PR #12 |
| `merge-local-changes` (PR #13) | **Merge first** | Consolidates mannyraji's spec + CI work; clean it up and merge |
| `copilot/vscode-mnnoy4r4-wesl` (PR #12) | **Merge second** | Best existing `packages/shared` implementation (140 tests, 91.5% coverage) |
| `copilot/implement-copilot-instructions` (PR #16) | **Keep open / re-trigger** | Resume or re-trigger the full implementation after the scaffolding is merged |

**Suggested merge order:**
1. Merge PR #13 (`merge-local-changes`) → gets the spec and `package-lock.json` into main
2. Merge PR #12 (`copilot/vscode-mnnoy4r4-wesl`) → adds full monorepo scaffold + tested `packages/shared`
3. Close PRs #7, #8, #9, #10 (superseded)
4. Re-trigger or continue PR #16 to implement the remaining MCP server packages
