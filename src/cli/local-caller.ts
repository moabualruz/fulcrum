import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";
import { TRPCError } from "@trpc/server";

import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../db/db.module.ts";
import { Session } from "../db/entities/auth/Session.ts";
import { appRouter } from "../trpc/router.ts";
import { createContext } from "../trpc/context.ts";
import { t } from "../trpc/trpc.ts";

export async function createLocalCaller(options: {
  container?: Container | null;
  requireSession?: boolean;
} = {}) {
  const { container, em } = buildCliContext(options.container ?? null);
  const session = await resolveActiveCliSession(em);
  if (options.requireSession && !session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    });
  }

  const orgId = session?.activeOrganizationId ?? session?.orgId ?? null;
  const userId = session?.userId ?? null;
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(
    createContext({
      session: session as unknown as BetterAuthSession | null,
      orgId,
      userId,
      em,
      container,
    }),
  );
}

function buildCliContext(container: Container | null): { container: Container | null; em: EntityManager | null } {
  if (!container) return { container: null, em: null };

  try {
    const orm = container.get(MikroORM);
    const em = container.get(ENTITY_MANAGER_TOKEN).fork();
    const requestContainer = new Container();
    requestContainer.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(requestContainer, orm, em);
    return { container: requestContainer, em };
  } catch {
    return { container, em: null };
  }
}

async function resolveActiveCliSession(em: EntityManager | null): Promise<{
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
} | null> {
  if (!em) return null;

  const now = new Date();
  try {
    const session = await em.findOne(
      Session,
      { expiresAt: { $gt: now } },
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
      userAgent: session.userAgent ?? "fulcrum-cli",
    };
  } catch {
    return null;
  }
}
