import { describe, expect, test } from "bun:test";

import { DEFAULT_ADMIN_EMAIL } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { localDevSession } from "@platform-core/application/runtime/web-request-runtime.ts";

describe("web request runtime", () => {
  test("local development session uses the seeded admin user id", async () => {
    const db = await createTestOrm();
    try {
      const session = await localDevSession({
        em: db.em,
        container: {
          get: () => {
            throw new Error("not used");
          },
          has: () => false,
          bind: () => {},
        },
      });

      expect(session.orgId).toBe(db.seed.orgId);
      expect(session.userId).toBe(db.seed.userId);
      expect(session.session).toMatchObject({ userId: db.seed.userId });

      const user = await db.em.query("SELECT email FROM users WHERE id = $1", [db.seed.userId]);
      expect(user[0]).toMatchObject({ email: DEFAULT_ADMIN_EMAIL });
    } finally {
      await db.close();
    }
  });
});
