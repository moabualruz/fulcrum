export type AppErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invariant"
  | "external_dependency";

export interface AppErrorOptions {
  cause?: unknown;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
  recovery?: string;
  traceId?: string;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly fieldErrors?: Record<string, string[]>;
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;
  readonly traceId: string;

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
    this.recovery = options.recovery;
    this.traceId = options.traceId ?? createDiagnosticTraceId();
  }
}

export class AppValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("validation", message, options);
  }
}

export class AppUnauthorizedError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("unauthorized", message, options);
  }
}

export class AppForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("forbidden", message, options);
  }
}

export class AppNotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("not_found", message, options);
  }
}

export class AppConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("conflict", message, options);
  }
}

export class AppInvariantError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("invariant", message, options);
  }
}

export class AppExternalDependencyError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super("external_dependency", message, options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

function createDiagnosticTraceId(): string {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
