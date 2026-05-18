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
  toAppError,
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

  test("preserves validation field errors in HTTP response bodies", () => {
    const response = appErrorToHttpResponse(new AppValidationError("Invalid task.", {
      fieldErrors: { title: ["Required"], status: ["Unknown status"] },
      recovery: "Add a title and choose a supported status.",
      traceId: "trace-test-validation",
    }));

    expect(response).toEqual({
      status: 400,
      body: {
        error: "Invalid task.",
        code: "validation",
        recovery: "Add a title and choose a supported status.",
        traceId: "trace-test-validation",
        fieldErrors: { title: ["Required"], status: ["Unknown status"] },
      },
    });
  });

  test("adds recovery action and diagnostic trace to every HTTP error response", () => {
    const response = appErrorToHttpResponse(new AppForbiddenError("denied", { traceId: "trace-denied" }));

    expect(response.body).toMatchObject({
      error: "denied",
      code: "forbidden",
      recovery: "Request access or switch to an account with permission.",
      traceId: "trace-denied",
    });
  });

  test("sanitizes unknown and invariant errors before public transport mapping", () => {
    const unknown = toAppError(new Error("database password leaked in stack"));
    const invariant = appErrorToHttpResponse(new AppInvariantError("sql constraint user_email_key failed"));
    const external = appErrorToHttpResponse(new AppExternalDependencyError("provider token abc123 failed"));

    expect(unknown.message).toBe("Internal server error.");
    expect(invariant.body.error).toBe("Internal server error.");
    expect(external.body.error).toBe("External dependency unavailable.");
  });
});
