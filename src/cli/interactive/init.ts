// fulcrum init — interactive org + admin@local user seeding.
// Idempotent: no-op after first successful run.

import type { ProductDb } from "../../product-kernel/db/types.ts";
import { newUlid } from "../../product-kernel/ids.ts";
import { InteractiveRequiredError } from "./errors.ts";

export interface SeedResult {
  created: boolean;
  orgId: string;
  userId: string;
}

/** Seed default org + admin@local user. Idempotent. */
export async function seedOrgAndAdmin(db: ProductDb): Promise<SeedResult> {
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

  const orgId = newUlid();
  const userId = newUlid();

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

/**
 * Interactive init entry point.
 * In non-interactive mode, throws InteractiveRequiredError (exit 7) if a
 * prompt would be needed (i.e. no existing org).
 */
export async function runInteractiveInit(
  db: ProductDb,
  opts: InitOptions = {},
): Promise<SeedResult> {
  // Check if org already exists — if so, no prompt needed.
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM orgs WHERE slug = $1",
    ["default"],
  );

  if (existing.length === 0 && opts.nonInteractive) {
    throw new InteractiveRequiredError(
      "org does not exist; `fulcrum init` needs confirmation to create it",
    );
  }

  // In interactive mode we would prompt here. For now, seed directly.
  return seedOrgAndAdmin(db);
}
