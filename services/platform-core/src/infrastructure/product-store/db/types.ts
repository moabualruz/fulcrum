export type SqlValue = string | number | boolean | null | Uint8Array;

export interface ProductDb {
  query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}
