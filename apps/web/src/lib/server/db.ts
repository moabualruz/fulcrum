export type OrmDbValue = string | number | boolean | null | Date | Uint8Array;

export interface ApplicationPersistence {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ApplicationOrm {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface WebDatabaseHandle {
  orgId?: string;
  orm?: ApplicationOrm;
  em?: ApplicationPersistence;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface E2eFixtureContext {
  db: WebDatabaseHandle;
  orgId: string;
}

function retired(): never {
  throw new Error("Web database runtime is retired; use public API web clients.");
}

export function __resetDatabaseForTest(): void {}
export async function closeDatabase(): Promise<void> {}
export async function closeProductDb(): Promise<void> {}
export function getDatabase(): WebDatabaseHandle {
  return retired();
}
export async function getDefaultOrgId(
  _db?: Pick<WebDatabaseHandle, "query">,
): Promise<string> {
  return retired();
}
export async function getE2eFixtureContext(): Promise<E2eFixtureContext> {
  return retired();
}
export function getProductDb(): WebDatabaseHandle {
  return retired();
}
export async function initDatabase(): Promise<WebDatabaseHandle> {
  return retired();
}
export async function initProductDb(): Promise<WebDatabaseHandle> {
  return retired();
}
export async function openDatabase(..._args: unknown[]): Promise<WebDatabaseHandle> {
  return retired();
}
export async function openProductDb(..._args: unknown[]): Promise<WebDatabaseHandle> {
  return retired();
}
export function __resetProductDbForTest(): void {}
