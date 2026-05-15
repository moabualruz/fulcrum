import type { Session } from "better-auth";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { User, Session as SessionEntity } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { adminSession, type TestSession } from "./auth-session.ts";
import type { TestContainer } from "./application-container.ts";
import type { TestOrm } from "./application-database.ts";

const createCaller = t.createCallerFactory(appRouter);

async function resolveDefaultSession(
  orm: TestOrm,
): Promise<TestSession> {
  const admin = await orm.em.findOne(User, { where: { email: DEFAULT_ADMIN_EMAIL } });

  if (admin === null) {
    return adminSession(orm.seed);
  }

  const active = await orm.em.findOne(SessionEntity, { where: { userId: admin.id } });
  return adminSession({
    orgId: (admin as { orgId?: string }).orgId ?? DEFAULT_ORG_ID,
    userId: admin.id,
    sessionToken: active?.id,
  });
}

export async function createTestCaller(
  orm: TestOrm,
  container?: TestContainer,
  session?: Session | null,
) {
  const resolvedSession = session === undefined
    ? await resolveDefaultSession(orm)
    : session;
  const contextSession = resolvedSession as TestSession | null;
  const orgId = contextSession?.activeOrganizationId ?? contextSession?.orgId ?? null;
  const userId = contextSession?.userId ?? null;

  return createCaller(
    createContext({
      session: resolvedSession,
      orgId,
      userId,
      em: orm.em,
      container: container ?? null,
    }),
  );
}
