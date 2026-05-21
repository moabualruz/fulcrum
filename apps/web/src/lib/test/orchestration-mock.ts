/**
 * Complete `mock.module` factory for `$lib/server/orchestration`.
 *
 * `$lib/server/orchestration` is a barrel that re-exports `SYMPHONY_COLORS` /
 * `SymphonyState` from `$lib/orchestration` and `* from`
 * `@execution-orchestration/interface/orchestration-settings.ts`. Bun's
 * `mock.module` is process-global and freezes the export-name set on first
 * registration: `routes/orchestration/page.server.test.ts` mocked this barrel
 * with only `loadOrchestrationDashboard` / `listOrchestrationProjectOptions` /
 * `SYMPHONY_COLORS`, which stripped `loadOrchestrationConfig` /
 * `upsertOrchestrationConfig` / `listWorkflowDefs` / … for every sibling. The
 * `/settings/orchestration` route, which imports the real
 * `loadOrchestrationConfig`, then failed with "Export named … not found".
 *
 * `orchestrationMock(suiteSeam)` carries *every* real export name. Each call to
 * a function export consults `suiteSeam`: while the owning suite is active it
 * may return per-export overrides; otherwise (or for un-overridden exports) the
 * call delegates to the real `orchestration-settings` interface — imported here
 * directly, never via `$lib/server/orchestration`, which would resolve back to
 * this mock and recurse.
 */

import { SYMPHONY_COLORS } from "$lib/orchestration";
import * as orchestrationSettings from "@execution-orchestration/interface/orchestration-settings.ts";

const ORCHESTRATION_FN_EXPORTS = [
  "loadOrchestrationDashboard",
  "listOrchestrationProjectOptions",
  "loadOrchestrationConfig",
  "listWorkflowDefs",
  "loadWorkflowDef",
  "upsertOrchestrationConfig",
  "upsertWorkflowDef",
] as const;

export type OrchestrationFnExport = (typeof ORCHESTRATION_FN_EXPORTS)[number];

/**
 * Seam invoked on every function-export call. Return the owning suite's
 * per-export overrides while the suite is active, or `null` to delegate every
 * call to the real implementation (foreign-suite path).
 */
export type OrchestrationSuiteSeam = () =>
  | Partial<Record<OrchestrationFnExport, (...args: unknown[]) => unknown>>
  | null;

export function orchestrationMock(suiteSeam: OrchestrationSuiteSeam): Record<string, unknown> {
  const result: Record<string, unknown> = { SYMPHONY_COLORS };
  for (const name of ORCHESTRATION_FN_EXPORTS) {
    result[name] = (...args: unknown[]) => {
      const override = suiteSeam()?.[name];
      const fn =
        override ?? (orchestrationSettings[name] as (...a: unknown[]) => unknown);
      return fn(...args);
    };
  }
  return result;
}
