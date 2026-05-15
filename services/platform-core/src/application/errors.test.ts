import { describe, expect, test } from "bun:test";

import {
  AppConflictError,
  AppError,
  AppExternalDependencyError,
  AppForbiddenError,
  AppInvariantError,
  AppNotFoundError,
  AppUnauthorizedError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";

describe("application error taxonomy", () => {
  test("exports all seven typed AppError classes from D-12", () => {
    const errors = [
      new AppValidationError("invalid input", { fieldErrors: { title: ["Required"] } }),
      new AppUnauthorizedError("login required"),
      new AppForbiddenError("access denied"),
      new AppNotFoundError("task missing"),
      new AppConflictError("state conflict"),
      new AppInvariantError("domain invariant failed"),
      new AppExternalDependencyError("provider unavailable"),
    ];

    expect(errors.every((error) => error instanceof AppError)).toBe(true);
    expect(errors.map((error) => error.name)).toEqual([
      "AppValidationError",
      "AppUnauthorizedError",
      "AppForbiddenError",
      "AppNotFoundError",
      "AppConflictError",
      "AppInvariantError",
      "AppExternalDependencyError",
    ]);
    expect(errors.map((error) => error.kind)).toEqual([
      "validation",
      "unauthorized",
      "forbidden",
      "not_found",
      "conflict",
      "invariant",
      "external_dependency",
    ]);
  });
});
