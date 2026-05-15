import type { Session } from "better-auth";

import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { ENTITY_MANAGER_TOKEN } from "@platform-core/infrastructure/application-database/db.module.ts";
import { Session as SessionEntity, User } from "@platform-core/infrastructure/application-database/entities/auth/index.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { adminSession, type TestSession } from "./auth-session.ts";
import type { TestContainer } from "./application-container.ts";

const createCaller = t.createCallerFactory(appRouter);

async function resolveDefaultSession(
  container: TestContainer,
): Promise<TestSession> {
  const em = container.get(ENTITY_MANAGER_TOKEN).fork();
  const admin = await em.findOne(User, { email: DEFAULT_ADMIN_EMAIL });

  if (admin === null) {
    return adminSession(container.__fulcrumTestSeed);
  }

  const active = await em.findOne(SessionEntity, { userId: admin.id });
  return adminSession({
    orgId: admin.orgId ?? DEFAULT_ORG_ID,
    userId: admin.id,
    sessionToken: active?.id,
  });
}

export async function createTestCaller(
  container: TestContainer,
  session?: Session | null,
) {
  const resolvedSession = session === undefined
    ? await resolveDefaultSession(container)
    : session;
  const em = container.get(ENTITY_MANAGER_TOKEN).fork();
  const contextSession = resolvedSession as TestSession | null;
  const orgId = contextSession?.activeOrganizationId ?? contextSession?.orgId ?? null;
  const userId = contextSession?.userId ?? null;

  return createCaller(
    createContext({
      session: resolvedSession,
      orgId,
      userId,
      em,
      container,
    }),
  );
}
