# LeagueDataApp Implementation Roadmap

## Goal
Stabilize analytics correctness, improve user trust and readability, and scale performance for larger seasons while keeping iteration speed high.

## Planning Assumptions
- Team capacity baseline: 1 engineer, part-time product/design input.
- Sprint length: 1 week.
- Effort scale:
  - S = 0.5 to 1.5 days
  - M = 2 to 4 days
  - L = 5+ days

## Priority Stack

### P0 - Correctness and Trust (Do First)

1. Shared analytics engine (single source of truth)
- Why: Rankings, stars, and metric cards currently risk drift when logic is duplicated.
- Scope:
  - Move ranking/star/metric aggregation into one shared module.
  - Expose reusable typed selectors for:
    - per-player metrics
    - field-normalized metric scores
    - weighted composite score
    - star conversion
  - Replace local duplicated logic in profile and compare paths with shared selectors.
- Effort: L
- Dependencies: none
- Success criteria:
  - Same player + same event scope always yields same star/rank everywhere.
  - Snapshot tests confirm parity between views.

2. Ranking explainability panel
- Why: Users need to trust and understand why a player is ranked where they are.
- Scope:
  - Add Explain Rank action next to star/rank in profile and trends.
  - Show:
    - weighted metric contributions
    - positive and negative drivers
    - last-event deltas
  - Add links to supporting events.
- Effort: M
- Dependencies: shared analytics engine
- Success criteria:
  - Users can answer why rank changed this week in 1 click.

3. Readability and theme hardening
- Why: Recent tooltip and contrast issues indicate theme token drift.
- Scope:
  - Standardize chart text/tooltip tokens.
  - Remove hardcoded low-contrast colors in chart and modal contexts.
  - Add visual regression checks for light/dark mode key screens.
- Effort: M
- Dependencies: none
- Success criteria:
  - No illegible chart labels/tooltips in light or dark mode.

4. Analytics unit test suite
- Why: Prevent silent scoring regressions.
- Scope:
  - Add tests for:
    - normalization and inversion behavior
    - tie handling
    - weighted score computation
    - event-scope filtering effects
    - star conversion thresholds
- Effort: M
- Dependencies: shared analytics engine
- Success criteria:
  - Test coverage on analytics module is meaningful and enforced in CI.

### P1 - Data Quality and Admin Workflow

5. Import diff and preview before commit
- Why: Avoid accidental bad imports and improve confidence.
- Scope:
  - Show what changes before saving:
    - new events
    - updated events
    - impacted standings
- Effort: L
- Dependencies: shared analytics engine helpful but not required
- Success criteria:
  - Admin sees clear data delta before applying import.

6. Duplicate and conflict detection
- Why: Multiple source imports can create duplicate event records.
- Scope:
  - Duplicate checks by event number/date/source URL signature.
  - Warn with merge/replace options.
- Effort: M
- Dependencies: import diff feature recommended
- Success criteria:
  - Duplicate creation is prevented or explicit.

7. Source freshness and stale data alerts
- Why: URL-backed events can become outdated.
- Scope:
  - Track last fetch age and stale thresholds.
  - Add refresh all stale sources action.
- Effort: S
- Dependencies: existing source URL metadata (already present)
- Success criteria:
  - Admin can quickly identify and refresh stale data.

### P2 - UX Depth and Productivity

8. Saved view presets
- Why: Frequent users repeatedly configure same filters.
- Scope:
  - Save selected events/players/tab/chart preferences.
  - Quick apply presets.
- Effort: M
- Dependencies: none
- Success criteria:
  - Setup time for common analysis paths is reduced.

9. Metric confidence indicators
- Why: Small samples can mislead ranking interpretation.
- Scope:
  - Display confidence badge based on sample size/coverage.
  - Add tooltip with confidence rules.
- Effort: S
- Dependencies: shared analytics engine
- Success criteria:
  - Users can immediately see metric reliability.

10. Drill-down timelines from metrics
- Why: Users need fast evidence for each number.
- Scope:
  - Clicking any metric card opens event-by-event trace.
  - Include highlight of counted vs excluded rounds.
- Effort: M
- Dependencies: explainability panel
- Success criteria:
  - Every key metric is inspectable from the same screen.

### P3 - Performance and Scale

11. Chart route/component code splitting
- Why: Bundle is currently large and triggers warning.
- Scope:
  - Lazy load heavy chart modules by tab.
  - Keep first paint focused on active tab.
- Effort: M
- Dependencies: none
- Success criteria:
  - Reduced initial JS payload and faster first interaction.

12. Virtualized long tables
- Why: Performance will degrade with larger leagues/seasons.
- Scope:
  - Virtualize standings/history/admin long lists.
- Effort: M
- Dependencies: none
- Success criteria:
  - Smooth scrolling with large datasets.

13. Computation caching for filtered analytics
- Why: Recomputations can become expensive as data grows.
- Scope:
  - Memoize analytics by event scope + player set.
  - Invalidate only on relevant data changes.
- Effort: M
- Dependencies: shared analytics engine
- Success criteria:
  - Noticeably lower UI lag when switching filters.

## Milestone Plan

### Milestone 1 - Foundations (Weeks 1 to 2)
- Items:
  - Shared analytics engine
  - Analytics unit tests
  - Readability/theme hardening
- Output:
  - Single analytics source in production use
  - Baseline test safety net
  - Contrast regressions addressed

### Milestone 2 - Trust and Explainability (Week 3)
- Items:
  - Ranking explainability panel
  - Metric drill-down timelines
- Output:
  - Users can understand and audit rankings quickly

### Milestone 3 - Admin Safety (Week 4)
- Items:
  - Import diff preview
  - Duplicate/conflict detection
  - Source freshness alerts
- Output:
  - Safer ingestion and cleaner event history

### Milestone 4 - Speed and Repeatability (Weeks 5 to 6)
- Items:
  - Saved presets
  - Code splitting
  - Table virtualization
  - Analytics caching
- Output:
  - Better daily usability and improved performance at scale

## Suggested Build Order (Strict)
1. Shared analytics engine
2. Analytics tests
3. Replace all star/rank call sites
4. Explainability panel
5. Import diff and duplicate checks
6. Performance work

## Risks and Mitigations
- Risk: Logic migration breaks existing rankings.
  - Mitigation: Add parity tests against current outputs before switch.
- Risk: UI complexity increases with explainability views.
  - Mitigation: Progressive disclosure with collapsible sections.
- Risk: Performance work arrives too late.
  - Mitigation: Implement code splitting early in Milestone 4 and track load metrics.

## Tracking Metrics
- Correctness:
  - Star/rank parity mismatches across views = 0
  - Analytics test failures in CI = 0
- UX trust:
  - Tooltip contrast/readability defects = 0
  - Time-to-explain-rank (manual task) under 15 seconds
- Performance:
  - Initial bundle size trend down
  - Tab-switch interaction remains smooth on larger datasets

## Quick Start Tasks for Next Session
1. Create shared analytics module under src/lib for normalized metric and composite score computation.
2. Add test file for tie handling and normalization edge cases.
3. Refactor Player Profile and Compare panel to consume shared selectors only.
4. Add Explain Rank modal skeleton wired to existing metric data.
