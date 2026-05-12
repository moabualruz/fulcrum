import type { EntityManager } from "@mikro-orm/postgresql";

import { ormSqlConnection } from "../orm-helpers.ts";

export interface SqlAccess {
  execute<T = unknown[]>(sql: string, params?: readonly unknown[]): Promise<T>;
}

export function sqlAccess(manager: EntityManager): SqlAccess {
  const handle = manager as EntityManager & {
    execute?: <T = unknown[]>(sql: string, params?: readonly unknown[]) => Promise<T>;
    query?: (sql: string, params?: readonly unknown[]) => Promise<unknown[]>;
    getConnection?: EntityManager["getConnection"];
  };
  if (typeof handle.getConnection === "function") return ormSqlConnection(manager) as SqlAccess;
  if (typeof handle.execute === "function") return handle;
  if (typeof handle.query === "function") {
    return {
      execute: async <T = unknown[]>(sql: string, params?: readonly unknown[]) => {
        return await handle.query!(sql, params) as T;
      },
    };
  }
  return ormSqlConnection(manager) as SqlAccess;
}
