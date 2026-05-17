import { initializeLocalDatabase } from "@platform-core/application/init/queries.ts";
import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG } from "@platform-core/infrastructure/application-database/seed.ts";

export async function initializeLocalProductReadiness(): Promise<{
  ok: true;
  engine: string;
  schemaApplied: readonly string[];
  org: { id: string; slug: string; name: string; created: boolean };
}> {
  const database = resolveDatabaseConfig();
  const status = await initializeLocalDatabase();
  return {
    ok: true,
    engine: database.backend,
    schemaApplied: [status],
    org: {
      id: DEFAULT_ORG_ID,
      slug: DEFAULT_ORG_SLUG,
      name: DEFAULT_ORG_NAME,
      created: status === "bootstrapped",
    },
  };
}
