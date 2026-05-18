import "reflect-metadata";

import { ValidationPipe, type INestApplication, type LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DataSource } from "typeorm";

import { AppModule } from "./app.module.ts";
import { TrpcRouter } from "./trpc/trpc.router.ts";
import { SeedService } from "@platform-core/infrastructure/application-database/seed.ts";

export interface FulcrumNestApplicationOptions {
  logger?: false | LogLevel[];
  openApiPath?: string;
}

export interface FulcrumNestServerOptions extends FulcrumNestApplicationOptions {
  port?: number;
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
  app.enableShutdownHooks();

  const openApiConfig = new DocumentBuilder()
    .setTitle("Fulcrum API")
    .setDescription("Agent-native project workflow API")
    .setVersion("0.1.0")
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig, {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
  SwaggerModule.setup(options.openApiPath ?? "openapi", app, openApiDocument, {
    jsonDocumentUrl: "api/v1/openapi.json",
  });

  const trpcRouter = app.get(TrpcRouter);
  await trpcRouter.applyMiddleware(app);

  return app;
}

export async function startFulcrumNestServer(
  options: FulcrumNestServerOptions = {},
): Promise<INestApplication> {
  const app = await createFulcrumNestApplication(options);
  await seedLocalDevelopmentRuntime(app);
  await app.listen(options.port ?? resolveFulcrumServerPort());
  return app;
}

async function seedLocalDevelopmentRuntime(app: INestApplication): Promise<void> {
  if (process.env["FULCRUM_REQUIRE_AUTH"]) return;

  const appWithGet = app as INestApplication & {
    get?: <TInput = unknown, TResult = TInput>(typeOrToken: TInput) => TResult;
  };
  if (typeof appWithGet.get !== "function") return;

  const dataSource = appWithGet.get(DataSource, { strict: false });
  if (!dataSource?.isInitialized) return;

  await new SeedService(dataSource.manager).run();
}
