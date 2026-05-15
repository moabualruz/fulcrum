import { resolveDefaultOrgId } from "@identity-access/application/auth/default-org.ts";
import type { FlagRegistry } from "@platform-core/application/feature-flags/registry.ts";
import type { ApplicationPersistence, ApplicationOrm } from "@platform-core/application/runtime/local-database.ts";
import { initDatabase } from "@platform-core/application/runtime/local-database.ts";
import { createFlagRegistry, registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { __resetDefaultOrmForTest } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";

export type { DiContainer } from "./di-container.ts";

export interface WebRequestRuntime {
  em: ApplicationPersistence;
  container: DiContainer;
}

export interface WebRuntime {
  authHandler: ((req: Request) => Promise<Response>) | null;
  orm: ApplicationOrm | { close: (force?: boolean) => Promise<void> };
  flagRegistry?: FlagRegistry;
  createRequestContext?: () => WebRequestRuntime;
  em?: ApplicationPersistence;
  container?: DiContainer;
}

export interface LocalDevelopmentSession {
  session: unknown;
  orgId: string | null;
  userId: string | null;
}

export async function createDefaultWebRuntime(): Promise<WebRuntime> {
  const { AuthService } = await import("@identity-access/application/auth/index.ts");

  const database = await initDatabase();
  const orm = database.orm;
  const flagRegistry = createFlagRegistry(orm);

  let authHandler: ((req: Request) => Promise<Response>) | null = null;
  try {
    const svc = new AuthService(orm.em);
    await svc.init();
    authHandler = svc.handler;
  } catch {
    authHandler = null;
  }

  return {
    authHandler,
    orm,
    flagRegistry,
    createRequestContext: () => {
      const em = orm.em.fork();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Container } = require("@needle-di/core") as { Container: new () => DiContainer };
      const container = new Container();
      registerDbBindings(container as never, orm, em, { flagRegistry });
      return { em, container };
    },
  };
}

export function createWebRequestRuntime(runtime: WebRuntime): WebRequestRuntime {
  if (runtime.createRequestContext) {
    return runtime.createRequestContext();
  }

  if (!runtime.em || !runtime.container) {
    throw new Error("Web runtime is missing request context bindings.");
  }

  const maybeFork = runtime.em as ApplicationPersistence & {
    fork?: () => ApplicationPersistence;
  };

  if (typeof maybeFork.fork === "function") {
    throw new Error("Forkable web runtime must provide createRequestContext.");
  }

  return {
    em: runtime.em,
    container: runtime.container,
  };
}

export function clearWebRequestRuntime(runtime: WebRequestRuntime | null): void {
  const maybeClear = runtime?.em as (ApplicationPersistence & { clear?: () => void }) | null;
  maybeClear?.clear?.();
}

export async function localDevSession(requestRuntime: WebRequestRuntime | null): Promise<LocalDevelopmentSession> {
  let orgId: string | null = null;
  if (requestRuntime?.em) {
    orgId = await resolveDefaultOrgId(requestRuntime.em).catch(() => null);
  }

  return {
    session: {
      id: "local-dev-session",
      userId: "local-admin",
      expiresAt: new Date(Date.now() + 86400000),
    },
    orgId,
    userId: "local-admin",
  };
}

export async function closeWebRuntimeForTest(runtime: WebRuntime | null): Promise<void> {
  const closedDefaultOrm = await __resetDefaultOrmForTest();
  if (runtime?.orm && runtime.orm !== closedDefaultOrm) {
    await runtime.orm.close(true);
  }
}
