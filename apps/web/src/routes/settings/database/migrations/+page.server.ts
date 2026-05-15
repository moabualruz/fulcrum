import { fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import {
  defaultProductDbStatus,
  type ProductDbConnectionSummary,
  type ProductDbStatus,
} from "@platform-core/application/db/commands.ts";

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
    backend: ProductDbStatus["backend"];
    connection: ProductDbConnectionSummary;
  };
}

export const load: PageServerLoad = (): MigrationPageData => {
  const database = defaultProductDbStatus();
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
