import { afterEach, describe, expect, it } from "bun:test";
import type { EntityManager } from "typeorm";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { ConnectorCredential } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; em: EntityManager; org: Org }> {
  db = await createTestOrm();
  const em = db.em;
  const org = await em.findOneOrFail(Org, { where: { id: db.seed.orgId } });
  return { db, em, org };
}

describe("settings and credentials entities", () => {
  it("persists and reloads ConnectorCredential with org/project FK", async () => {
    const { em, org } = await setup();

    const credential = em.create(ConnectorCredential, {
      org,
      projectId: "project-settings",
      provider: "github",
      accountId: "installation-9",
      label: "GitHub App installation",
      encryptedSecret: "encrypted:v1:abc",
      metadata: { scopes: ["contents:read"] },
    });
    await em.save(credential);

    const reloaded = await em.findOneOrFail(ConnectorCredential, {
      where: { provider: "github", accountId: "installation-9" },
      relations: { org: true },
    });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-settings");
  });
});
