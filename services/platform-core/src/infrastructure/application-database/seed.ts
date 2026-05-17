import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { MoreThan } from "typeorm";
import { hashPassword } from "better-auth/crypto";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Account, OrgMember, Session, User } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { seedDefaultRules } from "@notification-center/application/delivery-runtime/defaults.ts";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_ORG_NAME = "Local";
export const DEFAULT_ORG_SLUG = "local";
export const DEFAULT_ADMIN_EMAIL = "admin@local";
export const DEFAULT_ADMIN_PASSWORD = "fulcrum-local-admin";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SeedResult {
  orgId: string;
  userId: string;
  sessionToken: string;
}

@Injectable()
export class SeedService {
  constructor(
    private readonly em: EntityManager,
  ) {}

  async run(): Promise<SeedResult> {
    const now = new Date();

    await this.em.upsert(Org, {
      id: DEFAULT_ORG_ID,
      name: DEFAULT_ORG_NAME,
      slug: DEFAULT_ORG_SLUG,
      updatedAt: now,
    }, ["id"]);
    const defaultOrg = await this.em.findOneOrFail(Org, { where: { id: DEFAULT_ORG_ID } });

    await this.em.upsert(User, {
      email: DEFAULT_ADMIN_EMAIL,
      orgId: defaultOrg.id,
      role: "owner",
      updatedAt: now,
    }, ["orgId", "email"]);
    const adminUser = await this.em.findOneOrFail(User, { where: { email: DEFAULT_ADMIN_EMAIL, orgId: defaultOrg.id } });

    await this.em.upsert(OrgMember, {
      orgId: defaultOrg.id,
      userId: adminUser.id,
      role: "owner",
    }, ["orgId", "userId"]);

    if (await this.hasPublicOrganizationTables()) {
      await this.em.query(`
        INSERT INTO fulcrum_workspaces (id, slug, name, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, updated_at = EXCLUDED.updated_at
      `, [defaultOrg.id, DEFAULT_ORG_SLUG, DEFAULT_ORG_NAME, now]);
      await this.em.query(`
        INSERT INTO fulcrum_organization_members (id, org_id, user_id, role)
        VALUES ($1, $2, $3, 'owner')
        ON CONFLICT (org_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
      `, [`${defaultOrg.id}:${adminUser.id}`, defaultOrg.id, adminUser.id]);
    }

    await seedDefaultRules(adminUser.id, defaultOrg.id, this.em);

    const credentialAccount = await this.em.findOne(Account, {
      where: { userId: adminUser.id, providerId: "credential" },
    });

    if (!credentialAccount) {
      const account = this.em.create(Account, {
        userId: adminUser.id,
        providerId: "credential",
        accountId: adminUser.id,
        password: await hashPassword(DEFAULT_ADMIN_PASSWORD),
        createdAt: now,
        updatedAt: now,
      });
      await this.em.save(account);
    }

    const activeSession = await this.em.findOne(Session, {
      where: { userId: adminUser.id, expiresAt: MoreThan(now) },
    });

    if (activeSession) {
      return {
        orgId: defaultOrg.id,
        userId: adminUser.id,
        sessionToken: activeSession.id,
      };
    }

    const sessionToken = crypto.randomUUID();
    const session = this.em.create(Session, {
      id: sessionToken,
      userId: adminUser.id,
      orgId: defaultOrg.id,
      activeOrganizationId: defaultOrg.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      createdAt: now,
    });
    await this.em.save(session);

    return {
      orgId: defaultOrg.id,
      userId: adminUser.id,
      sessionToken,
    };
  }

  private async hasPublicOrganizationTables(): Promise<boolean> {
    const rows = await this.em.query(
      "SELECT to_regclass('public.fulcrum_workspaces') AS workspaces, to_regclass('public.fulcrum_organization_members') AS members",
    );
    return Boolean(rows[0]?.workspaces && rows[0]?.members);
  }
}
