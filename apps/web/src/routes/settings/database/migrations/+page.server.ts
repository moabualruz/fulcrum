import { fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import {
  defaultDatabaseStatus,
  type DatabaseConnectionSummary,
  type DatabaseStatus,
} from "@platform-core/interface/database-status.ts";

/** Shape of a migration row for the client. */
export interface MigrationRow {
  version: number;
  name: string;
  appliedAt: string;
  checksum: string;
  direction: "up" | "down";
}

export interface MigrationPageData {
  history: MigrationRow[];
  status: { current: string | null; pending: string[]; pastDue: number };
  database: {
    backend: DatabaseStatus["backend"];
    connection: DatabaseConnectionSummary;
  };
}

export const load: PageServerLoad = (): MigrationPageData => {
  const database = defaultDatabaseStatus();
  return {
    database: {
      backend: database.backend,
      connection: database.connection,
    },
    status: {
      current: database.current,
      pending: database.pending,
      pastDue: database.pastDue,
    },
    history: [],
  };
};

export const actions: Actions = {
  migrate: async () => {
    return fail(501, {
      ok: false,
      message: "Database migration actions are not available from the web runtime.",
    });
  },
};
