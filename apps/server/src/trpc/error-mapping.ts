import { TRPCError } from "@trpc/server";

import { publicAppErrorMessage, toAppError } from "@platform-core/application/error-mapping.ts";
import type { AppErrorKind } from "@platform-core/domain/errors.ts";

type TrpcCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const TRPC_CODES: Record<AppErrorKind, TrpcCode> = {
  validation: "BAD_REQUEST",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  conflict: "CONFLICT",
  invariant: "INTERNAL_SERVER_ERROR",
  external_dependency: "INTERNAL_SERVER_ERROR",
};

export function appErrorToTrpcError(error: unknown): TRPCError {
  const appError = toAppError(error);
  return new TRPCError({
    code: TRPC_CODES[appError.kind],
    message: publicAppErrorMessage(appError),
    cause: appError,
  });
}
