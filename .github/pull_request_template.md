## Summary
<!-- What does this PR do? Link the relevant spec section or task. -->

## Type
- [ ] Feature (new tool or scraper implementation)
- [ ] Bug fix
- [ ] Refactor / infrastructure
- [ ] Docs / config only

## Checklist
- [ ] `npm run typecheck` passes locally
- [ ] `npm run test --workspaces` passes locally (with coverage ≥ 80%)
- [ ] `npm run lint` passes locally
- [ ] `npm run format:check` passes locally
- [ ] New public API changes are reflected in `specs/001-shared-utilities-lib/contracts/public-api.md`
- [ ] Cache TTLs match the table in `.github/copilot-instructions.md`
- [ ] Input validation present for any new tool boundary (VIN, lot number, zip code)
- [ ] **NMVTIS cost guard**: `nmvtis_title_check` is NOT called from `scan_deals` batch path

## Testing
<!-- Describe what was tested and how (unit, fixture, integration). -->

## Notes for reviewer
<!-- Anything that needs extra attention. -->
