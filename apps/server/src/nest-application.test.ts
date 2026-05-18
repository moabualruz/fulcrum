import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ValidationPipe } from "@nestjs/common";

type FakeNestApp = {
  readonly pipes: unknown[];
  readonly shutdownHooks: unknown[];
  shutdownHooksEnabled: boolean;
  readonly listenedPorts: number[];
  useGlobalPipes: (...pipes: unknown[]) => void;
  enableShutdownHooks: (...signals: unknown[]) => void;
  get: (token: unknown, options?: unknown) => unknown;
  listen: (port: number) => Promise<void>;
};

const trpcApplyMiddleware = mock(async (_app: unknown) => {});

function createFakeNestApp(): FakeNestApp {
  return {
    pipes: [],
    shutdownHooks: [],
    shutdownHooksEnabled: false,
    listenedPorts: [],
    useGlobalPipes(...pipes: unknown[]) {
      this.pipes.push(...pipes);
    },
    enableShutdownHooks(...signals: unknown[]) {
      this.shutdownHooksEnabled = true;
      this.shutdownHooks.push(...signals);
    },
    get(token: unknown) {
      if (typeof token === "function" && token.name === "TrpcRouter") {
        return { applyMiddleware: trpcApplyMiddleware };
      }
      return undefined;
    },
    async listen(port: number) {
      this.listenedPorts.push(port);
    },
  };
}

const createdApps: FakeNestApp[] = [];
const nestCreate = mock(async (_module: unknown, _options: unknown) => {
  const app = createFakeNestApp();
  createdApps.push(app);
  return app;
});
const swaggerCreateDocument = mock((_app: unknown, config: unknown) => ({
  openapi: "3.1.0",
  config,
}));
const swaggerSetup = mock((_path: string, _app: unknown, _document: unknown) => {});

function noopDecorator() {
  return () => undefined;
}

class TestDocumentBuilder {
  private readonly values: Record<string, string> = {};

  setTitle(value: string): this {
    this.values["title"] = value;
    return this;
  }

  setDescription(value: string): this {
    this.values["description"] = value;
    return this;
  }

  setVersion(value: string): this {
    this.values["version"] = value;
    return this;
  }

  build(): Record<string, string> {
    return { ...this.values };
  }
}

mock.module("@nestjs/core", () => ({
  NestFactory: {
    create: nestCreate,
  },
}));

mock.module("@nestjs/swagger", () => ({
  ApiAcceptedResponse: noopDecorator,
  ApiBody: noopDecorator,
  ApiCreatedResponse: noopDecorator,
  ApiNoContentResponse: noopDecorator,
  ApiOkResponse: noopDecorator,
  ApiOperation: noopDecorator,
  ApiParam: noopDecorator,
  ApiQuery: noopDecorator,
  ApiTags: noopDecorator,
  DocumentBuilder: TestDocumentBuilder,
  SwaggerModule: {
    createDocument: swaggerCreateDocument,
    setup: swaggerSetup,
  },
}));

describe("Nest server application bootstrap", () => {
  beforeEach(() => {
    createdApps.length = 0;
    nestCreate.mockClear();
    swaggerCreateDocument.mockClear();
    swaggerSetup.mockClear();
    trpcApplyMiddleware.mockClear();
  });

  test("creates a Nest Express app with validation and OpenAPI configured", async () => {
    const { createFulcrumNestApplication } = await import("./nest-application.ts");

    const app = await createFulcrumNestApplication({ logger: false });
    const createdApp = createdApps[0];
    if (!createdApp) throw new Error("NestFactory mock did not create an app");

    expect(nestCreate).toHaveBeenCalledTimes(1);
    expect(app).toBe(createdApp as unknown as typeof app);
    expect(createdApp.pipes[0]).toBeInstanceOf(ValidationPipe);
    expect(createdApp.shutdownHooksEnabled).toBe(true);
    expect(swaggerCreateDocument).toHaveBeenCalledWith(app, {
      title: "Fulcrum API",
      description: "Agent-native project workflow API",
      version: "0.1.0",
    });
    expect(swaggerSetup).toHaveBeenCalledWith("openapi", app, {
      openapi: "3.1.0",
      config: {
        title: "Fulcrum API",
        description: "Agent-native project workflow API",
        version: "0.1.0",
      },
    });
    expect(trpcApplyMiddleware).toHaveBeenCalledWith(app);
  });

  test("starts the Nest app on the configured port", async () => {
    const { startFulcrumNestServer } = await import("./nest-application.ts");

    const app = await startFulcrumNestServer({ port: 4321, logger: false });
    const createdApp = createdApps[0];
    if (!createdApp) throw new Error("NestFactory mock did not create an app");

    expect(app).toBe(createdApp as unknown as typeof app);
    expect(createdApp.listenedPorts).toEqual([4321]);
  });
});
