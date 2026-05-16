import { resolveDefaultOrgId } from "@identity-access/application/auth/default-org.ts";
import type { FlagRegistry } from "@platform-core/application/feature-flags/registry.ts";
import type { ApplicationPersistence, ApplicationOrm } from "@platform-core/application/runtime/local-database.ts";
import { initDatabase } from "@platform-core/application/runtime/local-database.ts";
import { __resetDataSourceForTest } from "@platform-core/infrastructure/application-database/typeorm.config.ts";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { FeatureFlagRepository } from "@identity-access/infrastructure/database/repositories/auth/FeatureFlagRepository.ts";

import type { DiContainer } from "./di-container.ts";
export type { DiContainer } from "./di-container.ts";

export interface WebRequestRuntime {
  em: ApplicationPersistence;
  container: DiContainer;
}

export interface WebRuntime {
  authHandler: ((req: Request) => Promise<Response>) | null;
  orm: ApplicationOrm | { destroy: () => Promise<void> };
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
  const em = database.em;

  // Build FlagRegistry from DataSource directly (standalone, no NestJS DI).
  let flagRegistry: FlagRegistry | undefined;
  try {
    const { FlagRegistry } = await import("@platform-core/application/feature-flags/registry.ts");
    const flagRepo = new FeatureFlagRepository(orm.getRepository(FeatureFlag) as never);
    flagRegistry = new FlagRegistry(flagRepo as never);
  } catch {
    // Flag registry unavailable — non-fatal.
  }

  let authHandler: ((req: Request) => Promise<Response>) | null = null;
  try {
    const svc = new AuthService(em);
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
      // TypeORM EntityManager is not forked — share the manager from DataSource.
      const requestEm = orm.manager;
      const bindings = new Map<unknown, unknown>();
      const container: DiContainer = {
        get: (token: unknown) => {
          if (bindings.has(token)) return bindings.get(token) as never;
          throw new Error(`Token not found in container: ${String(token)}`);
        },
        has: (token: unknown) => bindings.has(token),
        bind: (binding: unknown) => {
          const b = binding as { provide?: unknown; useValue?: unknown };
          if (b?.provide !== undefined) bindings.set(b.provide, b.useValue);
        },
      };
      return { em: requestEm, container };
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

  return {
    em: runtime.em,
    container: runtime.container,
  };
}

export function clearWebRequestRuntime(_runtime: WebRequestRuntime | null): void {
  // TypeORM EntityManager does not need explicit clearing between requests.
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
  __resetDataSourceForTest();
  if (runtime?.orm && "destroy" in runtime.orm) {
    await runtime.orm.destroy();
  }
}
