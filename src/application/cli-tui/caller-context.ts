import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import type { Session as BetterAuthSession } from "better-auth";

import { openDatabase, resolveDatabaseConfig } from "../../config/database.ts";
import { ENTITY_MANAGER_TOKEN, registerDbBindings } from "../../db/db.module.ts";
import { Session } from "../../db/entities/auth/Session.ts";
import { applyProductMigrations } from "../../db/product-migrations.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Local";

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
  container: Container | null;
  em: EntityManager | null;
}

export interface LocalCallerOptions {
  container?: Container | null;
  requireSession?: boolean;
  missingSessionMessage?: string;
  userAgent?: string;
}

export function buildCliTuiCallerContext(container: Container | null): CliTuiCallerContext {
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
  const cliContext = buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (options.requireSession && !session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
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
      em: cliContext.em,
      container: cliContext.container,
    }),
  );
}

export async function requireCliTuiSessionContext(
  options: LocalCallerOptions = {},
): Promise<CliTuiCallerContext & { session: CliTuiSession; orgId: string; userId: string }> {
  const cliContext = buildCliTuiCallerContext(options.container ?? null);
  const session = await resolveCliTuiSession(cliContext.em, options.userAgent);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: options.missingSessionMessage ??
        "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` first.",
    });
  }
  return {
    ...cliContext,
    session,
    orgId: session.activeOrganizationId ?? session.orgId,
    userId: session.userId,
  };
}

export async function initializeLocalProductReadiness(): Promise<{
  ok: true;
  engine: string;
  schemaApplied: readonly string[];
  org: { id: string; slug: string; name: string; created: boolean };
}> {
  const db = await openDatabase(resolveDatabaseConfig());
  try {
    const schemaApplied = await applyProductMigrations(db);
    const org = await ensureLocalOrg(db);
    return { ok: true, engine: db.engine, schemaApplied, org };
  } finally {
    await db.close();
  }
}

async function ensureLocalOrg(db: Awaited<ReturnType<typeof openDatabase>>): Promise<{
  id: string;
  slug: string;
  name: string;
  created: boolean;
}> {
  const existing = await db.query<{ id: string; slug: string; name: string }>(
    "SELECT id, slug, name FROM orgs WHERE slug = $1",
    [DEFAULT_ORG_SLUG],
  );
  if (existing[0]) return { ...existing[0], created: false };

  const rows = await db.query<{ id: string; slug: string; name: string }>(
    "INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3) RETURNING id, slug, name",
    [crypto.randomUUID(), DEFAULT_ORG_SLUG, DEFAULT_ORG_NAME],
  );
  const org = rows[0];
  if (!org) throw new Error("failed to create local org");
  return { ...org, created: true };
}
