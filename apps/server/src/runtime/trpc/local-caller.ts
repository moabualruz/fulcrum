import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";

import { AppUnauthorizedError } from "@platform-core/domain/errors.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";
import { ENTITY_MANAGER_TOKEN, registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { Session } from "@platform-core/infrastructure/application-database/entities/auth/Session.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

export interface CliTuiSession {
  id: string;
  token: string;
  userId: string;
  orgId: string;
  activeOrganizationId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CliTuiCallerContext {
  container: DiContainer | null;
  em: EntityManager | null;
}

export interface LocalCallerOptions {
  container?: DiContainer | null;
  requireSession?: boolean;
  missingSessionMessage?: string;
  userAgent?: string;
}

export async function buildCliTuiCallerContext(container: DiContainer | null): Promise<CliTuiCallerContext> {
  if (!container) return { container: null, em: null };

  try {
    const orm = container.get(MikroORM);
    const em = (container.get(ENTITY_MANAGER_TOKEN) as EntityManager).fork();
    const { Container: NeedleDiContainer } = await import("@needle-di/core");
    const requestContainer = new NeedleDiContainer() as unknown as DiContainer;
    requestContainer.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(requestContainer as never, orm, em);
    return { container: requestContainer, em };
  } catch {
    return { container, em: null };
  }
}

export async function resolveCliTuiSession(
  em: EntityManager | null,
  userAgent = "fulcrum-cli",
): Promise<CliTuiSession | null> {
  if (!em) return null;

  try {
    const session = await em.findOne(
      Session,
      { expiresAt: { $gt: new Date() } },
      { orderBy: { createdAt: "DESC" } },
    );
    if (!session) return null;

    return {
      id: session.id,
      token: session.id,
      userId: session.userId,
      orgId: session.orgId,
      activeOrganizationId: session.activeOrganizationId ?? session.orgId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? userAgent,
    };
  } catch {
    return null;
  }
}

export async function createApplicationLocalCaller(options: LocalCallerOptions = {}) {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (options.requireSession && !session) {
    throw new AppUnauthorizedError(
      options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    );
  }

  const orgId = session?.activeOrganizationId ?? session?.orgId ?? null;
  const userId = session?.userId ?? null;
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(
    createContext({
      session: session as unknown as BetterAuthSession | null,
      orgId,
      userId,
      em: cliContext.em,
      container: cliContext.container,
    }),
  );
}

export async function requireCliTuiSessionContext(
  options: LocalCallerOptions = {},
): Promise<CliTuiCallerContext & { session: CliTuiSession; orgId: string; userId: string }> {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (!session) {
    throw new AppUnauthorizedError(
      options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    );
  }
  return {
    ...cliContext,
    session,
    orgId: session.activeOrganizationId ?? session.orgId,
    userId: session.userId,
  };
}
