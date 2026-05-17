import { mkdir } from "node:fs/promises";
import { DataSource } from "typeorm";

import { resolveDatabaseConfig } from "@platform-core/application/db/database-config.ts";
import { DEFAULT_ORG_ID } from "@platform-core/application/tenancy/defaults.ts";
import { initDataSource, __resetDataSourceForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { dbCanRunOnCurrentBinary } from "@platform-core/infrastructure/application-database/doctor-checks.ts";
import { SchemaMigrationRepository } from "@platform-core/infrastructure/application-database/repositories/SchemaMigrationRepository.ts";

import type { DiContainer } from "./di-container.ts";
export type { DiContainer } from "./di-container.ts";

export interface LocalApplicationContainer {
  container: DiContainer;
  cleanup: () => Promise<void>;
}

export async function buildLocalApplicationContainer(): Promise<LocalApplicationContainer> {
  const database = resolveDatabaseConfig();
  const dataSource = await initDataSource();

  await dataSource.runMigrations({ transaction: "each" });

  const container: DiContainer = {
    get: (token: unknown) => {
      if (token === DataSource) return dataSource as never;
      throw new Error(`Token not found in container: ${String(token)}`);
    },
    has: (token: unknown) => token === DataSource,
    bind: () => {},
  };

  return {
    container,
    cleanup: async () => {
      await dataSource.destroy();
    },
  };
}

export async function verifyLocalApplicationMigrations(container: DiContainer): Promise<void> {
  const dataSource = container.get(DataSource);
  const hasPending = await dataSource.showMigrations();

  if (hasPending) {
    throw new Error(`Migrations pending. Run \`fulcrum db migrate\` before \`fulcrum web\`.`);
  }

  const schemaMigrationRepo = new SchemaMigrationRepository(dataSource.getRepository(
    (await import("@platform-core/infrastructure/application-database/entities/SchemaMigration.ts")).SchemaMigration
  ) as never);
  const binaryCheck = await dbCanRunOnCurrentBinary(schemaMigrationRepo);
  if (binaryCheck.status === "fail") {
    throw new Error(binaryCheck.detail);
  }
}

export async function startLocalWorkflowSupervisor(container: DiContainer): Promise<{ stop: () => void }> {
  const dataSource = container.get(DataSource);
  const [{ WorkflowConfigSchema }, { startSymphonyOrchestrator }] = await Promise.all([
    import("@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts"),
    import("@execution-orchestration/infrastructure/agent-runtime/symphony/orchestrator.ts"),
  ]);
  return startSymphonyOrchestrator(
    dataSource.manager,
    DEFAULT_ORG_ID,
    WorkflowConfigSchema.parse({}),
  );
}
