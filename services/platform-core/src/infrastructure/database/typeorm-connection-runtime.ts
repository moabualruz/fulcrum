import { mkdir } from "node:fs/promises";

import type { PGlite } from "@electric-sql/pglite";
import type { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { OnApplicationShutdown } from "@nestjs/common";
import type { DataSourceOptions } from "typeorm";

import {
  buildFulcrumTypeOrmOptions,
  createFulcrumTypeOrmDataSource,
  type FulcrumTypeOrmConnection,
  type FulcrumTypeOrmOptions,
  resolveFulcrumTypeOrmConnectionTarget,
} from "@platform-core/infrastructure/database/typeorm-data-source.ts";

export interface FulcrumTypeOrmRuntimeOptionsInput {
  env?: Record<string, string | undefined>;
  entities?: NonNullable<DataSourceOptions["entities"]>;
  migrations?: NonNullable<DataSourceOptions["migrations"]>;
}

export interface FulcrumTypeOrmManagedDataSource {
  dataSource: ReturnType<typeof createFulcrumTypeOrmDataSource>;
  close: () => Promise<void>;
}

interface LocalSocketHandle {
  dataDir: string;
  pglite: PGlite;
  socketServer: PGLiteSocketServer;
  url: string;
}

export class FulcrumTypeOrmConnectionRuntime implements OnApplicationShutdown {
  private localSocket: LocalSocketHandle | undefined;

  async createOptions(
    input: FulcrumTypeOrmRuntimeOptionsInput = {},
  ): Promise<FulcrumTypeOrmOptions> {
    const connection = await this.resolveConnection(input.env);

    return buildFulcrumTypeOrmOptions({
      ...connection,
      entities: input.entities ?? [],
      migrations: input.migrations ?? [],
    });
  }

  async createManagedDataSource(
    input: FulcrumTypeOrmRuntimeOptionsInput = {},
  ): Promise<FulcrumTypeOrmManagedDataSource> {
    const dataSource = createFulcrumTypeOrmDataSource(await this.createOptions(input));
    return {
      dataSource,
      close: async () => {
        if (dataSource.isInitialized) await dataSource.destroy();
        await this.close();
      },
    };
  }

  async resolveConnection(
    env: Record<string, string | undefined> = process.env,
  ): Promise<FulcrumTypeOrmConnection> {
    const target = resolveFulcrumTypeOrmConnectionTarget(env);
    if (target.source !== "pglite") {
      await this.close();
      return target;
    }
    return this.openLocalSocket(target.dataDir);
  }

  async close(): Promise<void> {
    if (!this.localSocket) return;

    const handle = this.localSocket;
    this.localSocket = undefined;
    try {
      await handle.socketServer.stop();
    } finally {
      await handle.pglite.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private async openLocalSocket(dataDir: string): Promise<FulcrumTypeOrmConnection> {
    if (this.localSocket?.dataDir === dataDir) {
      return { source: "pglite-socket", url: this.localSocket.url };
    }

    await this.close();
    await mkdir(dataDir, { recursive: true });
    const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("@electric-sql/pglite-socket"),
    ]);
    const pglite = new PGlite(dataDir);
    await pglite.waitReady;

    const socketServer = new PGLiteSocketServer({
      db: pglite,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 20,
    });
    await socketServer.start();

    const [host, port] = socketServer.getServerConn().split(":");
    const url = `postgresql://postgres:postgres@${host}:${port}/postgres`;
    this.localSocket = { dataDir, pglite, socketServer, url };
    return { source: "pglite-socket", url };
  }
}

export async function createFulcrumTypeOrmManagedDataSource(
  input: FulcrumTypeOrmRuntimeOptionsInput = {},
): Promise<FulcrumTypeOrmManagedDataSource> {
  return new FulcrumTypeOrmConnectionRuntime().createManagedDataSource(input);
}
