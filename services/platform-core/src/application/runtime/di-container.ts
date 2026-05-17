/**
 * DiContainer — minimal DI container interface.
 *
 * Structurally compatible with needle-di Container at runtime.
 * Used during migration from needle-di to NestJS DI to avoid importing
 * from @needle-di/core in non-bootstrap code.
 */
export interface DiContainer {
  // Overload 1: class constructor → infer instance type
  get<T>(token: abstract new (...args: never) => T): T;
  // Overload 2: any other token (string, symbol, InjectionToken) → caller must cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(token: unknown): any;
  has(token: unknown): boolean;
  // Accept any binding shape — needle-di and NestJS have different Provider types
  bind(binding: unknown): void;
}
