# Issue Management MVP

This document defines the MVP automation for issue hygiene and triage.

## Scope

- Intake Quality Agent
- Auto Triage and Labeling Agent
- SLA and Escalation Agent

## Workflows

- `.github/workflows/issue-intake-quality.yml`
  - Trigger: issue opened/edited/reopened
  - Validates required intake fields
  - Applies `needs-info` when fields are missing
  - Adds `status:ready-for-triage` when complete
  - Upserts an intake checklist comment

- `.github/workflows/issue-triage.yml`
  - Trigger: issue opened/reopened/edited and `status:ready-for-triage` labeled
  - Runs only when intake marks `status:ready-for-triage`
  - Applies type, area, severity, and priority labels
  - Suggests owner via triage summary comment
  - Flags low confidence with `needs-human-triage`
  - Suggests duplicate candidates and adds `duplicate:suspect`

- `.github/workflows/issue-sla-monitor.yml`
  - Trigger: hourly schedule and manual dispatch
  - Detects first-response and resolution SLA breaches
  - Applies `sla:breached-first-response` and `sla:breached-resolution`
  - Escalates critical unresolved breaches via `escalation:critical`

## Intake Requirements

Required sections in issue body:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Logs / screenshots
- Environment
- Impact

## Label Taxonomy

- Type: `type:bug`, `type:feature`, `type:docs`
- Area: `area:shared`, `area:copart-scraper-mcp`, `area:iaai-scraper-mcp`, `area:docs`, `area:infra`, `area:unknown`
- Severity: `severity:critical`, `severity:high`, `severity:medium`, `severity:low`
- Priority: `priority:p1`, `priority:p2`, `priority:p3`
- Status: `status:ready-for-triage`, `status:triaged`, `needs-info`, `needs-human-triage`
- Signals: `duplicate:suspect`, `triage:owner-suggested`
- SLA: `sla:breached-first-response`, `sla:breached-resolution`, `escalation:critical`

## SLA Targets

- Critical: first response 4h, resolution 24h
- High: first response 24h, resolution 7d
- Medium: first response 72h, resolution 14d
- Low: first response 120h, resolution 30d

## Operational Notes

- Bot comments are idempotent: each workflow updates a marker comment instead of posting duplicates.
- Triage assignment is advisory in MVP; maintainers keep final ownership decisions.
- For rollout safety, you can disable any workflow file individually from the Actions UI.
