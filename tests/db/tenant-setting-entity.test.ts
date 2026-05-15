import { describe, expect, it } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import { TenantSettingRepository } from "@platform-core/infrastructure/application-database/repositories/TenantSettingRepository.ts";

describe("TenantSetting MikroORM entity", () => {
  it("maps tenant_settings with org-scoped key uniqueness", async () => {
    const pglite = new PGlite();
    const orm = await MikroORM.init({
      dbName: "postgres",
      driverOptions: new PGliteKyselyDialect(() => pglite),
      entities: [Org, TenantSetting],
      debug: false,
    });

    try {
      await orm.schema.create();
      const metadata = orm.getMetadata().get(TenantSetting);
      expect(metadata.tableName).toBe("tenant_settings");
      expect(metadata.properties["id"]?.primary).toBe(true);
      expect(metadata.properties["orgId"]?.fieldNames).toEqual(["org_id"]);
      expect(metadata.properties["key"]).toBeDefined();
      expect(metadata.properties["value"]?.type).toMatch(/json/i);
      expect(metadata.properties["createdAt"]?.fieldNames).toEqual(["created_at"]);
      expect(metadata.properties["updatedAt"]?.fieldNames).toEqual(["updated_at"]);
      expect(metadata.uniques?.some((unique) => unique.name === "uq_tenant_settings_org_key")).toBe(true);

      const repo = orm.em.fork().getRepository(TenantSetting);
      expect(repo).toBeInstanceOf(TenantSettingRepository);
    } finally {
      await orm.close(true);
      await pglite.close();
    }
  });
});
