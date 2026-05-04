/**
 * @deprecated Use src/api/hono.ts instead — this file is a shim for backwards
 * compatibility with existing tests. Will be removed once tests migrate.
 *
 * Previously: Public REST/OpenAPI router for tasks, sprints, and reports.
 * Now: delegates to the unified API at src/api/hono.ts.
 */

import type { ProductDb } from "../db/types.ts";
import { createPublicApi as createUnifiedApi } from "../../api/hono.ts";
import { isPublicApiEnabled as _isPublicApiEnabled } from "../../api/feature-flags.ts";

/**
 * @deprecated Use `createPublicApi` from `src/api/hono.ts` instead.
 */
export function createPublicApi(db: ProductDb, _defaultOrgId: string) {
  return createUnifiedApi({ db });
}

/**
 * @deprecated Use `isPublicApiEnabled` from `src/api/feature-flags.ts` instead.
 */
export function isPublicApiEnabled(): boolean {
  return _isPublicApiEnabled();
}
