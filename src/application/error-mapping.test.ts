import { describe, expect, test } from "bun:test";

import {
  AppConflictError,
  AppExternalDependencyError,
  AppForbiddenError,
  AppInvariantError,
  AppNotFoundError,
  AppUnauthorizedError,
  AppValidationError,
} from "./errors.ts";
import {
  appErrorToCliExit,
  appErrorToHttpResponse,
  appErrorToTrpcError,
} from "./error-mapping.ts";

describe("application error transport mapping", () => {
  test("maps AppError taxonomy to tRPC codes", () => {
    expect(appErrorToTrpcError(new AppValidationError("bad")).code).toBe("BAD_REQUEST");
    expect(appErrorToTrpcError(new AppUnauthorizedError("auth")).code).toBe("UNAUTHORIZED");
    expect(appErrorToTrpcError(new AppForbiddenError("deny")).code).toBe("FORBIDDEN");
    expect(appErrorToTrpcError(new AppNotFoundError("missing")).code).toBe("NOT_FOUND");
    expect(appErrorToTrpcError(new AppConflictError("conflict")).code).toBe("CONFLICT");
    expect(appErrorToTrpcError(new AppInvariantError("broken")).code).toBe("INTERNAL_SERVER_ERROR");
    expect(appErrorToTrpcError(new AppExternalDependencyError("down")).code).toBe("INTERNAL_SERVER_ERROR");
  });

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
