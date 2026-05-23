import { describe, expect, test } from "bun:test";

import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import {
  AppInvariantError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";

describe("tRPC app error mapping", () => {
  test("maps validation errors with field errors preserved on the cause", () => {
    const error = appErrorToTrpcError(new AppValidationError("Invalid project.", {
      fieldErrors: { name: ["Required"] },
      recovery: "Add a project name, then retry.",
      traceId: "trace-project-validation",
    }));

    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("Invalid project.");
    expect(error.cause).toBeInstanceOf(AppValidationError);
    expect((error.cause as AppValidationError).fieldErrors).toEqual({ name: ["Required"] });
    expect((error.cause as AppValidationError).recovery).toBe("Add a project name, then retry.");
    expect((error.cause as AppValidationError).traceId).toBe("trace-project-validation");
  });

  test("sanitizes invariant and unknown errors before exposing tRPC messages", () => {
    expect(appErrorToTrpcError(new AppInvariantError("db password in stack")).message)
      .toBe("Internal server error.");
    expect(appErrorToTrpcError(new Error("raw SQL failed with token")).message)
      .toBe("Internal server error.");
  });
});
