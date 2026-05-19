import "reflect-metadata";

import { ValidationPipe, type INestApplication, type LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DataSource } from "typeorm";

import { AppModule } from "./app.module.ts";
import { LogRedactionInterceptor } from "@platform-core/application/log-redaction/logger-interceptor.ts";
import { TrpcRouter } from "./trpc/trpc.router.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { createGracefulShutdown } from "@platform-core/application/platform-operations/shutdown-coordinator.ts";
import { attachRouteTaxonomyMetadata } from "./public-api/route-taxonomy.ts";
import {
  createRuntimeReadiness,
  markRuntimeReady,
  recordStartupFailure,
  recordStartupStep,
  startOptionalRuntimeComponents,
  type RuntimeLifecycleLogger,
  type RuntimeReadinessState,
} from "./runtime/server-lifecycle.ts";

export interface FulcrumNestApplicationOptions {
  logger?: false | LogLevel[];
  openApiPath?: string;
}

export interface FulcrumNestServerOptions extends FulcrumNestApplicationOptions {
  port?: number;
  env?: Record<string, string | undefined>;
  runtimeLog?: RuntimeLifecycleLogger;
}

export interface FulcrumNestServerHandle {
  app: INestApplication;
  readiness: RuntimeReadinessState;
}

export function resolveFulcrumServerPort(
  env: Record<string, string | undefined> = process.env,
): number {
  const rawPort = env["FULCRUM_SERVER_PORT"] ?? env["PORT"] ?? "3000";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid server port: ${rawPort}`);
  }
  return port;
}

export async function createFulcrumNestApplication(
  options: FulcrumNestApplicationOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: options.logger ?? ["log", "error", "warn"],
  });

  app.useGlobalPipes(new ValidationPipe({
    forbidUnknownValues: false,
    transform: true,
    whitelist: true,
  }));
  app.useGlobalInterceptors(new LogRedactionInterceptor());
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("Fulcrum API")
    .setDescription("Agent-native project workflow API")
    .setVersion("0.1.0")
    .addBearerAuth({
      type: "http",
      scheme: "bearer",
      bearerFormat: "API key",
      description: "Public API requests use Authorization: Bearer <api-key>.",
    })
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig, {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
  attachRouteTaxonomyMetadata(openApiDocument);
  SwaggerModule.setup(options.openApiPath ?? "openapi", app, openApiDocument, {
    jsonDocumentUrl: "api/v1/openapi.json",
  });

  const trpcRouter = app.get(TrpcRouter);
  await trpcRouter.applyMiddleware(app);

  return app;
}

export async function startFulcrumNestServerWithLifecycle(
  options: FulcrumNestServerOptions = {},
): Promise<FulcrumNestServerHandle> {
  const readiness = createRuntimeReadiness();
  const env = options.env ?? process.env;

  try {
    recordStartupStep(readiness, "config", options.runtimeLog);
    const port = options.port ?? resolveFulcrumServerPort(env);

    const app = await createFulcrumNestApplication(options);
    const dataSource = getRuntimeDataSource(app);

    recordStartupStep(readiness, "database", options.runtimeLog);
    recordStartupStep(readiness, "migrations", options.runtimeLog);
    recordStartupStep(readiness, "nest", options.runtimeLog);

    await seedLocalDevelopmentRuntime(app);

    const runtimeComponents = await startOptionalRuntimeComponents({
      dataSource,
      env,
      log: options.runtimeLog,
    });
    readiness.components.push(...runtimeComponents.components);
    recordStartupStep(readiness, "streams-workers", options.runtimeLog);

    await app.listen(port);
    installRuntimeShutdown(app, dataSource, runtimeComponents.closeables);
    markRuntimeReady(readiness, options.runtimeLog);

    return { app, readiness };
  } catch (error) {
    recordStartupFailure(readiness, readiness.completed.at(-1) ?? "config", error, options.runtimeLog);
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      readiness,
    });
  }
}

export async function startFulcrumNestServer(
  options: FulcrumNestServerOptions = {},
): Promise<INestApplication> {
  const { app } = await startFulcrumNestServerWithLifecycle(options);
  return app;
}

async function seedLocalDevelopmentRuntime(app: INestApplication): Promise<void> {
  if (process.env["FULCRUM_REQUIRE_AUTH"]) return;

  const dataSource = getRuntimeDataSource(app);
  if (!dataSource?.isInitialized) return;

  await new SeedService(dataSource.manager).run();
}

function getRuntimeDataSource(app: INestApplication): DataSource | null {
  const appWithGet = app as INestApplication & {
    get?: <TInput = unknown, TResult = TInput>(typeOrToken: TInput) => TResult;
  };
  if (typeof appWithGet.get !== "function") return null;

  return appWithGet.get(DataSource, { strict: false }) ?? null;
}

function installRuntimeShutdown(
  app: INestApplication,
  dataSource: DataSource | null,
  closeables: { close: () => Promise<void> | void }[],
): void {
  const originalClose = app.close.bind(app);
  const shutdown = createGracefulShutdown({
    stopWorkers: () => undefined,
    closeSubscriptions: async () => {
      for (const closeable of closeables) await closeable.close();
    },
    closeHttpServer: originalClose,
    closeDatabase: async () => {
      if (dataSource?.isInitialized) await dataSource.destroy();
    },
    cleanupWorkspaces: () => undefined,
  });

  app.close = async () => {
    const result = await shutdown.shutdown("app.close");
    if (!result.ok) throw new Error(`Graceful shutdown failed at ${result.failed}: ${result.error}`);
  };
}
