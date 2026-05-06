import { afterEach, describe, expect, it } from "bun:test";

import { createTestOrm, type TestOrm } from "../../../test-utils/db.ts";
import { Org } from "../auth/Org.ts";
import { ConnectorCredential } from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; org: Org }> {
  db = await createTestOrm();
  const org = await db.em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, org };
}

describe("settings and credentials MikroORM entities", () => {
  it("persists and reloads ConnectorCredential with org/project FK", async () => {
    const { db, org } = await setup();

    const credential = db.em.create(ConnectorCredential, {
      org,
      projectId: "project-settings",
      provider: "github",
      accountId: "installation-9",
      label: "GitHub App installation",
      encryptedSecret: "encrypted:v1:abc",
      metadata: { scopes: ["contents:read"] },
    });

    await db.em.persistAndFlush(credential);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(ConnectorCredential, {
      provider: "github",
      accountId: "installation-9",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-settings");
  });
});
