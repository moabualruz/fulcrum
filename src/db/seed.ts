import { inject, injectable } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";

import { ENTITY_MANAGER_TOKEN } from "./db.module.ts";
import { Org } from "./entities/auth/Org.ts";
import { OrgMember, Session, User } from "./entities/auth/index.ts";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_ORG_NAME = "Local";
export const DEFAULT_ORG_SLUG = "local";
export const DEFAULT_ADMIN_EMAIL = "admin@local";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SeedResult {
  orgId: string;
  userId: string;
  sessionToken: string;
}

@injectable()
export class SeedService {
  constructor(
    private readonly em: EntityManager = inject(ENTITY_MANAGER_TOKEN),
  ) {}

  async run(): Promise<SeedResult> {
    const em = this.em.fork();
    const now = new Date();
    const defaultOrg = await em.upsert(
      Org,
      {
        id: DEFAULT_ORG_ID,
        name: DEFAULT_ORG_NAME,
        slug: DEFAULT_ORG_SLUG,
        updatedAt: now,
      },
      { onConflictFields: ["id"] },
    );

    const adminUser = await em.upsert(
      User,
      {
        email: DEFAULT_ADMIN_EMAIL,
        orgId: defaultOrg.id,
        role: "owner",
        updatedAt: now,
      },
      { onConflictFields: ["orgId", "email"] },
    );

    await em.upsert(
      OrgMember,
      {
        orgId: defaultOrg.id,
        userId: adminUser.id,
        role: "owner",
      },
      { onConflictFields: ["orgId", "userId"] },
    );

    const activeSession = await em.findOne(Session, {
      userId: adminUser.id,
      expiresAt: { $gt: now },
    });

    if (activeSession) {
      return {
        orgId: defaultOrg.id,
        userId: adminUser.id,
        sessionToken: activeSession.id,
      };
    }

    const sessionToken = crypto.randomUUID();
    const session = em.create(Session, {
      id: sessionToken,
      userId: adminUser.id,
      orgId: defaultOrg.id,
      activeOrganizationId: defaultOrg.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
    });
    em.persist(session);
    await em.flush();

    return {
      orgId: defaultOrg.id,
      userId: adminUser.id,
      sessionToken,
    };
  }
}
