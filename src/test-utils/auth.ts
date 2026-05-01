import type { Session } from "better-auth";

import type { SeedResult } from "../db/seed.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "../db/seed.ts";

const DEFAULT_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";

export type TestSession = Session & {
  activeOrganizationId: string;
  orgId: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
};

export function adminSession(seed: Partial<SeedResult> = {}): TestSession {
  const now = new Date();
  const orgId = seed.orgId ?? DEFAULT_ORG_ID;
  const userId = seed.userId ?? DEFAULT_ADMIN_USER_ID;
  const token = seed.sessionToken ?? `test-session-${userId}`;

  return {
    id: token,
    token,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
    user: {
      id: userId,
      email: DEFAULT_ADMIN_EMAIL,
      emailVerified: true,
      name: "Local Admin",
      createdAt: now,
      updatedAt: now,
    },
  } as unknown as TestSession;
}
