import { afterEach, describe, expect, it } from "bun:test";
import type { EntityManager } from "@mikro-orm/postgresql";

import { createTestOrm, type TestOrm } from "../../../test-utils/db.ts";
import { Org } from "../auth/Org.ts";
import { ConnectorCredential } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; em: EntityManager; org: Org }> {
  db = await createTestOrm();
  const em = db.orm.em.fork();
  const org = await em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, em, org };
}

describe("settings and credentials MikroORM entities", () => {
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

    em.persist(credential);
    await em.flush();
    em.clear();

    const reloaded = await em.findOneOrFail(ConnectorCredential, {
      provider: "github",
      accountId: "installation-9",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-settings");
  });
});
