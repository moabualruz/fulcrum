import { mkdir } from "node:fs/promises";
import { Migrator } from "@mikro-orm/migrations";
import { MikroORM } from "@mikro-orm/postgresql";

import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { DEFAULT_ORG_ID } from "@platform-core/application/tenancy/defaults.ts";
import {
  registerDbBindings,
  SchemaMigrationRepository,
} from "@platform-core/infrastructure/application-database/db.module.ts";
import { dbCanRunOnCurrentBinary } from "@platform-core/infrastructure/application-database/doctor-checks.ts";
import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";

export type { DiContainer } from "./di-container.ts";

export interface LocalApplicationContainer {
  container: DiContainer;
  cleanup: () => Promise<void>;
}

type MigrationInfoLike = { name?: string };
type MigratorCompat = {
  getPendingMigrations?: () => Promise<MigrationInfoLike[]>;
  getPending?: () => Promise<MigrationInfoLike[]>;
};

export async function buildLocalApplicationContainer(): Promise<LocalApplicationContainer> {
  const database = resolveDatabaseConfig();
  if (database.backend === "postgres") {
    const config = createOrmConfig({ debug: false });
    const orm = await MikroORM.init({
      ...config,
      extensions: [Migrator],
    });
    const { Container } = await import("@needle-di/core");
    const container = new Container();
    container.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(container, orm);
    return {
      container,
      cleanup: async () => {
        await orm.close(true);
      },
    };
  }

  await mkdir(database.dataDir, { recursive: true });
  const [{ PGlite }, { PGliteKyselyDialect }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts"),
  ]);
  const pglite = new PGlite(database.dataDir);
  await pglite.waitReady;
  const dialect = new PGliteKyselyDialect(() => pglite);
  const config = createOrmConfig({ pglite, debug: false });
  const orm = await MikroORM.init({
    ...config,
    driverOptions: dialect,
    extensions: [Migrator],
  });

  const container = new Container();
  container.bind({ provide: MikroORM, useValue: orm });
  registerDbBindings(container, orm);

  return {
    container,
    cleanup: async () => {
      await orm.close(true);
      await pglite.close();
    },
  };
}

export async function verifyLocalApplicationMigrations(container: DiContainer): Promise<void> {
  const orm = container.get(MikroORM);
  const pending = await pendingMigrations(orm.migrator as MigratorCompat);
  if (pending.length > 0) {
    const names = pending.map((migration) => migration.name ?? "(unknown)").join(", ");
    throw new Error(`migrations pending: ${names}. Run \`fulcrum db migrate\` before \`fulcrum web\`.`);
  }

  const { Container: NeedleDiContainer } = await import("@needle-di/core");
  const compatibilityContainer = new NeedleDiContainer();
  registerDbBindings(compatibilityContainer as never, orm, orm.em.fork());
  const schemaMigrationRepo = compatibilityContainer.get(SchemaMigrationRepository);
  const binaryCheck = await dbCanRunOnCurrentBinary(schemaMigrationRepo);
  if (binaryCheck.status === "fail") {
    throw new Error(binaryCheck.detail);
  }
}

export async function startLocalWorkflowSupervisor(container: DiContainer): Promise<{ stop: () => void }> {
  const orm = container.get(MikroORM);
  const [{ WorkflowConfigSchema }, { startSymphonyOrchestrator }] = await Promise.all([
    import("@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts"),
    import("@execution-orchestration/infrastructure/agent-runtime/symphony/orchestrator.ts"),
  ]);
  return startSymphonyOrchestrator(
    orm.em,
    DEFAULT_ORG_ID,
    WorkflowConfigSchema.parse({}),
  );
}

async function pendingMigrations(migrator: MigratorCompat): Promise<MigrationInfoLike[]> {
  if (migrator.getPendingMigrations) return migrator.getPendingMigrations();
  if (migrator.getPending) return migrator.getPending();
  return [];
}
