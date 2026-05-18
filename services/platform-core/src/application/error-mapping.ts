import { AppError, AppInvariantError, type AppErrorKind } from "@platform-core/domain/errors.ts";

const HTTP_STATUSES: Record<AppErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invariant: 500,
  external_dependency: 502,
};

const CLI_EXITS: Record<AppErrorKind, number> = {
  validation: 2,
  unauthorized: 1,
  forbidden: 1,
  not_found: 1,
  conflict: 1,
  invariant: 1,
  external_dependency: 1,
};

const PUBLIC_MESSAGES: Partial<Record<AppErrorKind, string>> = {
  invariant: "Internal server error.",
  external_dependency: "External dependency unavailable.",
};

export interface AppHttpErrorResponse {
  status: number;
  body: {
    error: string;
    code: AppErrorKind;
    fieldErrors?: Record<string, string[]>;
    details?: Record<string, unknown>;
  };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppInvariantError(PUBLIC_MESSAGES.invariant!, { cause: error });
}

export function publicAppErrorMessage(error: AppError): string {
  return PUBLIC_MESSAGES[error.kind] ?? error.message;
}

export function appErrorToHttpResponse(error: unknown): AppHttpErrorResponse {
  const appError = toAppError(error);
  return {
    status: HTTP_STATUSES[appError.kind],
    body: {
      error: publicAppErrorMessage(appError),
      code: appError.kind,
      ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
      ...(appError.details ? { details: appError.details } : {}),
    },
  };
}

export function appErrorToCliExit(error: unknown): number {
  return CLI_EXITS[toAppError(error).kind];
}
