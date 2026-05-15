import type { EntityManager } from "typeorm";

export interface SqlAccess {
  execute<T = unknown[]>(sql: string, params?: readonly unknown[]): Promise<T>;
}

/** Wraps a TypeORM EntityManager as a SqlAccess for legacy callers. */
export function sqlAccess(manager: EntityManager): SqlAccess {
  return {
    execute: async <T = unknown[]>(sql: string, params?: readonly unknown[]) => {
      return await manager.query(sql, params as unknown[]) as T;
    },
  };
}
