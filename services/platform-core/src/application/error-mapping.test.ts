import { describe, expect, test } from "bun:test";

import {
  AppConflictError,
  AppExternalDependencyError,
  AppForbiddenError,
  AppInvariantError,
  AppNotFoundError,
  AppUnauthorizedError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";
import {
  appErrorToCliExit,
  appErrorToHttpResponse,
} from "@platform-core/application/error-mapping.ts";

describe("application error transport mapping", () => {
  test("maps AppError taxonomy to HTTP status codes", () => {
    expect(appErrorToHttpResponse(new AppValidationError("bad")).status).toBe(400);
    expect(appErrorToHttpResponse(new AppUnauthorizedError("auth")).status).toBe(401);
    expect(appErrorToHttpResponse(new AppForbiddenError("deny")).status).toBe(403);
    expect(appErrorToHttpResponse(new AppNotFoundError("missing")).status).toBe(404);
    expect(appErrorToHttpResponse(new AppConflictError("conflict")).status).toBe(409);
    expect(appErrorToHttpResponse(new AppInvariantError("broken")).status).toBe(500);
    expect(appErrorToHttpResponse(new AppExternalDependencyError("down")).status).toBe(502);
  });

  test("maps AppError taxonomy to CLI exit codes", () => {
    expect(appErrorToCliExit(new AppValidationError("bad"))).toBe(2);
    expect(appErrorToCliExit(new AppUnauthorizedError("auth"))).toBe(1);
    expect(appErrorToCliExit(new AppForbiddenError("deny"))).toBe(1);
    expect(appErrorToCliExit(new AppNotFoundError("missing"))).toBe(1);
    expect(appErrorToCliExit(new AppConflictError("conflict"))).toBe(1);
    expect(appErrorToCliExit(new AppInvariantError("broken"))).toBe(1);
    expect(appErrorToCliExit(new AppExternalDependencyError("down"))).toBe(1);
  });
});
