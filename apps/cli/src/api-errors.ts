type CodedError = {
  code: string;
  message: string;
};

type AppKindError = {
  kind: string;
  message: string;
};

const APP_KIND_TO_CODE: Record<string, string> = {
  validation: "BAD_REQUEST",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  not_found: "NOT_FOUND",
  conflict: "CONFLICT",
  invariant: "INTERNAL_SERVER_ERROR",
  external_dependency: "INTERNAL_SERVER_ERROR",
};

export function formatApiError(error: unknown): string {
  if (isCodedError(error)) return `${error.code}: ${error.message}`;
  if (isAppKindError(error)) return `${appKindCode(error.kind)}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatCommandError(error: unknown): string {
  if (isCodedError(error) || isAppKindError(error)) return formatApiError(error);
  return `Error: ${formatUnknownError(error)}`;
}

export function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function apiErrorCode(error: unknown): string | undefined {
  if (isCodedError(error)) return error.code;
  if (isAppKindError(error)) return appKindCode(error.kind);
  return undefined;
}

export function hasApiErrorCode(error: unknown, code: string): boolean {
  return apiErrorCode(error) === code;
}

function isCodedError(error: unknown): error is CodedError {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return typeof record["code"] === "string" && typeof record["message"] === "string";
}

function isAppKindError(error: unknown): error is AppKindError {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  return typeof record["kind"] === "string" && typeof record["message"] === "string";
}

function appKindCode(kind: string): string {
  return APP_KIND_TO_CODE[kind] ?? kind.toUpperCase();
}
