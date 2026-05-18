/**
 * Local session resolution — reads session from the local DataSource.
 *
 * Extracted from trpc/local-caller.ts so that CLI/TUI can resolve
 * sessions without importing the tRPC stack.
 */

import { DataSource, type EntityManager, MoreThan } from "typeorm";

import { AppUnauthorizedError } from "@platform-core/domain/errors.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";

import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import {
  resolveApplicationSessionContext,
} from "@identity-access/application/auth/session-context.ts";
import type { SessionContextDto } from "@identity-access/domain/identity.ts";

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
    const dataSource = container.get(DataSource);
    const em = dataSource.manager;
    const requestContainer: DiContainer = {
      get: (token: unknown) => {
        if (token === DataSource) return dataSource as never;
        throw new Error(`Token not found in container: ${String(token)}`);
      },
      has: (token: unknown) => token === DataSource,
      bind: () => {},
    };
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
    const session = await em.findOne(Session, {
      where: { expiresAt: MoreThan(new Date()) },
      order: { createdAt: "DESC" },
    });
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

export async function resolveCliTuiSessionFromContainer(options: {
  container?: DiContainer | null;
  userAgent?: string;
} = {}): Promise<CliTuiSession | null> {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  return resolveCliTuiSession(cliContext.em, options.userAgent);
}

export async function resolveCliTuiAuthContextFromContainer(options: {
  container?: DiContainer | null;
  userAgent?: string;
} = {}): Promise<SessionContextDto | null> {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (!session) return null;
  return resolveApplicationSessionContext(cliContext.em, {
    userId: session.userId,
    orgId: session.activeOrganizationId ?? session.orgId,
    session: session as unknown as import("better-auth").Session,
  });
}

export async function requireCliTuiSessionContext(
  options: LocalCallerOptions = {},
): Promise<CliTuiCallerContext & { session: CliTuiSession; orgId: string; userId: string; auth: SessionContextDto }> {
  const cliContext = await buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (!session) {
    throw new AppUnauthorizedError(
      options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    );
  }
  const auth = await resolveApplicationSessionContext(cliContext.em, {
    userId: session.userId,
    orgId: session.activeOrganizationId ?? session.orgId,
    session: session as unknown as import("better-auth").Session,
  });
  return {
    ...cliContext,
    session,
    orgId: session.activeOrganizationId ?? session.orgId,
    userId: session.userId,
    auth,
  };
}
