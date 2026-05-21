/**
 * Complete `mock.module` factory for `@planning-review/interface/project-review-reports.ts`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration — a later, fuller mock of the same path
 * cannot add names the first one omitted. Several route tests mock this module
 * with only the handful of exports they exercise; whichever test ran first
 * stripped the rest, so a sibling test importing e.g. `buildReviewWorkbenchModel`
 * failed with "Export named ... not found".
 *
 * `planningReviewMock(overrides)` returns an object carrying *every* real
 * export name. Provide behaviour for the exports a test cares about via
 * `overrides`; the rest default to a stub that throws if unexpectedly called,
 * so the export-name set is always complete regardless of test order.
 */

const PROJECT_REVIEW_REPORT_EXPORTS = [
  "buildFinalQaReport",
  "buildFinalQaFeedbackGate",
  "buildUatCodeReviewHandoff",
  "recordUatCodeReviewDecision",
  "applyConfiguredUatCodeReviewDecision",
  "runGeneratedE2eRegressionTests",
  "listGeneratedE2eRunHistory",
  "buildReviewWorkbenchModel",
  "saveReviewWorkbenchSession",
  "loadReviewWorkbenchSession",
  "appendReviewWorkbenchAnnotation",
] as const;

export type ProjectReviewReportExport = (typeof PROJECT_REVIEW_REPORT_EXPORTS)[number];

export function planningReviewMock(
  overrides: Partial<Record<ProjectReviewReportExport, unknown>> = {},
): Record<ProjectReviewReportExport, unknown> {
  const result = {} as Record<ProjectReviewReportExport, unknown>;
  for (const name of PROJECT_REVIEW_REPORT_EXPORTS) {
    result[name] = overrides[name] ?? (async () => {
      throw new Error(`planningReviewMock: ${name} was called but not stubbed for this test`);
    });
  }
  return result;
}
