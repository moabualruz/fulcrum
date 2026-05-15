import "reflect-metadata";

import { ValidationPipe, type INestApplication, type LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.ts";

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
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup(options.openApiPath ?? "openapi", app, openApiDocument);

  return app;
}

export async function startFulcrumNestServer(
  options: FulcrumNestServerOptions = {},
): Promise<INestApplication> {
  const app = await createFulcrumNestApplication(options);
  await app.listen(options.port ?? resolveFulcrumServerPort());
  return app;
}
