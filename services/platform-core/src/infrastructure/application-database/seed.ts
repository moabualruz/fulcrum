import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { MoreThan } from "typeorm";
import { hashPassword } from "better-auth/crypto";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Account, OrgMember, Session, User } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { OrganizationMemberEntity } from "@identity-access/infrastructure/database/organization.entities.ts";
import { seedDefaultRules } from "@notification-center/application/delivery-runtime/defaults.ts";
import { TenantSetting } from "./entities/TenantSetting.ts";
import { FulcrumProjectEntity, FulcrumWorkspaceEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_ORG_NAME = "Local";
export const DEFAULT_ORG_SLUG = "local";
export const DEFAULT_ADMIN_EMAIL = "admin@local";
export const DEFAULT_ADMIN_PASSWORD = "fulcrum-local-admin";
export const DEFAULT_PROJECT_ID = "local-project";
export const DEFAULT_PROJECT_SLUG = "local-project";
export const DEFAULT_PROJECT_NAME = "Local Project";
export const LOCAL_BOOTSTRAP_SEED_VERSION = "2026-05-18.local-bootstrap.v1";
export const LOCAL_BOOTSTRAP_SEED_STATUS_KEY = "local.bootstrap.seed.status";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SeedResult {
  orgId: string;
  projectId: string;
  userId: string;
  sessionToken: string;
  seedVersion: string;
  seedStatus: "ready";
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

    if (await this.hasPublicBootstrapTables()) {
      await this.seedPublicBootstrapRows(defaultOrg.id, adminUser.id, now);
    }

    await seedDefaultRules(adminUser.id, defaultOrg.id, this.em);
    await this.writeSeedStatus(defaultOrg.id, adminUser.id, now);

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
        projectId: DEFAULT_PROJECT_ID,
        userId: adminUser.id,
        sessionToken: activeSession.id,
        seedVersion: LOCAL_BOOTSTRAP_SEED_VERSION,
        seedStatus: "ready",
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
      projectId: DEFAULT_PROJECT_ID,
      userId: adminUser.id,
      sessionToken,
      seedVersion: LOCAL_BOOTSTRAP_SEED_VERSION,
      seedStatus: "ready",
    };
  }

  private async seedPublicBootstrapRows(orgId: string, userId: string, now: Date): Promise<void> {
    await this.em.getRepository(FulcrumWorkspaceEntity).save({
      id: orgId,
      slug: DEFAULT_ORG_SLUG,
      name: DEFAULT_ORG_NAME,
      updatedAt: now,
    });
    await this.em.getRepository(OrganizationMemberEntity).save({
      id: `${orgId}:${userId}`,
      orgId,
      userId,
      role: "owner",
    });
    await this.em.getRepository(FulcrumProjectEntity).save({
      id: DEFAULT_PROJECT_ID,
      workspaceId: orgId,
      slug: DEFAULT_PROJECT_SLUG,
      name: DEFAULT_PROJECT_NAME,
      description: "Default local project for first-run workflows.",
      status: "active",
      ownerId: userId,
      traceId: `seed:${LOCAL_BOOTSTRAP_SEED_VERSION}`,
      methodology: "kanban",
      workflowConfig: {
        transitions: {
          backlog: ["todo"],
          todo: ["in_progress"],
          in_progress: ["review", "done"],
          review: ["in_progress", "done"],
        },
      },
      enabledTaskTypes: ["task", "bug", "feature"],
      updatedAt: now,
    });
  }

  private async writeSeedStatus(orgId: string, userId: string, now: Date): Promise<void> {
    const value = {
      version: LOCAL_BOOTSTRAP_SEED_VERSION,
      status: "ready",
      orgId,
      userId,
      projectId: DEFAULT_PROJECT_ID,
      seededAt: now.toISOString(),
    };
    const existing = await this.em.findOne(TenantSetting, { where: { orgId, key: LOCAL_BOOTSTRAP_SEED_STATUS_KEY } });
    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
      await this.em.save(existing);
      return;
    }
    await this.em.save(this.em.create(TenantSetting, {
      orgId,
      key: LOCAL_BOOTSTRAP_SEED_STATUS_KEY,
      value,
    }));
  }

  private async hasPublicBootstrapTables(): Promise<boolean> {
    const rows = await this.em.query(
      "SELECT to_regclass('public.fulcrum_workspaces') AS workspaces, to_regclass('public.fulcrum_organization_members') AS members, to_regclass('public.fulcrum_projects') AS projects",
    );
    return Boolean(rows[0]?.workspaces && rows[0]?.members && rows[0]?.projects);
  }
}
