import { InteractiveRequiredError } from "@platform-core/application/init/errors.ts";

interface LegacySqlDb {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<unknown>;
}

export interface SeedResult {
  created: boolean;
  orgId: string;
  userId: string;
}

export async function seedOrgAndAdmin(db: LegacySqlDb): Promise<SeedResult> {
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM orgs WHERE slug = $1",
    ["default"],
  );
  if (existing.length > 0) {
    const orgId = existing[0]!.id;
    const existingUser = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE org_id = $1 AND handle = $2",
      [orgId, "admin@local"],
    );
    return { created: false, orgId, userId: existingUser[0]?.id ?? "" };
  }

  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  await db.exec(`
    INSERT INTO orgs (id, slug, name) VALUES ('${orgId}', 'default', 'Default Org');
    INSERT INTO users (id, org_id, handle, display_name, role)
      VALUES ('${userId}', '${orgId}', 'admin@local', 'Admin', 'admin');
  `);

  return { created: true, orgId, userId };
}

export interface InitOptions {
  nonInteractive?: boolean;
}

export async function runInteractiveInit(
  db: LegacySqlDb,
  opts: InitOptions = {},
): Promise<SeedResult> {
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM orgs WHERE slug = $1",
    ["default"],
  );

  if (existing.length === 0 && opts.nonInteractive) {
    throw new InteractiveRequiredError(
      "org does not exist; `fulcrum init` needs confirmation to create it",
    );
  }

  return seedOrgAndAdmin(db);
}
