/**
 * MikroOrmBetterAuthAdapter — maps Better-Auth v1 CRUD contract to
 * MikroORM EntityRepository calls.
 *
 * Better-Auth model names and how they map:
 *   "user"         → User entity        (users table)
 *   "session"      → Session entity     (sessions table)
 *   "account"      → Account entity     (accounts table)
 *   "verification" → Verification entity (verifications table)
 *   "member"       → OrgMember entity   (org_members table)
 *   "invitation"   → Invitation entity  (invitations table)
 *
 * Account and verification tables exist for local-first auth. SaaS-only flows
 * are gated in auth configuration, not in the adapter.
 * User lookups default to DEFAULT_ORG_ID for single-org local mode when no
 * orgId is supplied by the session context.
 * All reads and writes go through EntityManager and EntityRepository.
 */

import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { CustomAdapter, CleanedWhere, JoinConfig } from "@better-auth/core/db/adapter";

import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import { Session } from "@platform-core/infrastructure/application-database/entities/auth/Session.ts";
import { Account } from "@platform-core/infrastructure/application-database/entities/auth/Account.ts";
import { Verification } from "@platform-core/infrastructure/application-database/entities/auth/Verification.ts";
import { OrgMember } from "@platform-core/infrastructure/application-database/entities/auth/OrgMember.ts";
import { Invitation } from "@platform-core/infrastructure/application-database/entities/auth/Invitation.ts";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";

const BETTER_AUTH_LOCAL_ADMIN_EMAIL = "admin@local.fulcrum";

function normalizeLocalAuthEmail(email: unknown): unknown {
  if (typeof email !== "string") return email;
  return email.toLowerCase() === BETTER_AUTH_LOCAL_ADMIN_EMAIL
    ? DEFAULT_ADMIN_EMAIL
    : email;
}

/**
 * Build a MikroORM FilterQuery from Better-Auth CleanedWhere clauses.
 * Supports: eq, ne, lt, lte, gt, gte, in, not_in, contains, starts_with, ends_with.
 *
 * Returns plain Record — callers cast to their entity's FilterQuery.
 */
function buildWhere(
  where: CleanedWhere[],
  fieldMap: Record<string, string> = {},
): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const clause of where) {
    const field = fieldMap[clause.field] ?? clause.field;
    const { operator, value } = clause;
    switch (operator) {
      case "eq":
        query[field] = value;
        break;
      case "ne":
        query[field] = { $ne: value };
        break;
      case "lt":
        query[field] = { $lt: value };
        break;
      case "lte":
        query[field] = { $lte: value };
        break;
      case "gt":
        query[field] = { $gt: value };
        break;
      case "gte":
        query[field] = { $gte: value };
        break;
      case "in":
        query[field] = { $in: value as unknown[] };
        break;
      case "not_in":
        query[field] = { $nin: value as unknown[] };
        break;
      case "contains":
        query[field] = { $like: `%${value}%` };
        break;
      case "starts_with":
        query[field] = { $like: `${value}%` };
        break;
      case "ends_with":
        query[field] = { $like: `%${value}` };
        break;
      default:
        query[field] = value;
    }
  }
  return query;
}

/** Map Better-Auth camelCase field names to MikroORM User entity property names. */
const USER_FIELD_MAP: Record<string, string> = {
  id: "id",
  email: "email",
  name: "name",
  image: "avatarUrl",
  emailVerified: "emailVerified",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  orgId: "orgId",
  role: "role",
};

const SESSION_FIELD_MAP: Record<string, string> = {
  id: "id",
  userId: "userId",
  token: "id",       // Better-Auth uses "token" as the session's string PK alias
  expiresAt: "expiresAt",
  ipAddress: "ipAddress",
  userAgent: "userAgent",
  createdAt: "createdAt",
  orgId: "orgId",
  activeOrganizationId: "activeOrganizationId",
};

const MEMBER_FIELD_MAP: Record<string, string> = {
  id: "id",
  organizationId: "orgId",
  orgId: "orgId",
  userId: "userId",
  role: "role",
  createdAt: "joinedAt",
};

const INVITATION_FIELD_MAP: Record<string, string> = {
  id: "id",
  organizationId: "orgId",
  orgId: "orgId",
  email: "email",
  role: "role",
  token: "token",
  inviterId: "invitedById",
  expiresAt: "expiresAt",
  createdAt: "createdAt",
  status: "acceptedAt",
};

const ACCOUNT_FIELD_MAP: Record<string, string> = {
  id: "id",
  userId: "userId",
  providerId: "providerId",
  accountId: "accountId",
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  accessTokenExpiresAt: "accessTokenExpiresAt",
  refreshTokenExpiresAt: "refreshTokenExpiresAt",
  scope: "scope",
  idToken: "idToken",
  password: "password",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

const VERIFICATION_FIELD_MAP: Record<string, string> = {
  id: "id",
  identifier: "identifier",
  value: "value",
  expiresAt: "expiresAt",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

/** Simple in-memory store for rare/unknown model names Better-Auth might introduce. */
class InMemoryStore {
  private readonly store = new Map<string, Record<string, unknown>>();
  private readonly modelIndex = new Map<string, string[]>();

  private key(model: string, id: string): string {
    return `${model}:${id}`;
  }

  async create(model: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = (data["id"] as string | undefined) ?? crypto.randomUUID();
    const row = { ...data, id };
    this.store.set(this.key(model, id), row);
    const ids = this.modelIndex.get(model) ?? [];
    ids.push(id);
    this.modelIndex.set(model, ids);
    return row;
  }

  async findOne(model: string, where: CleanedWhere[]): Promise<Record<string, unknown> | null> {
    const ids = this.modelIndex.get(model) ?? [];
    for (const id of ids) {
      const row = this.store.get(this.key(model, id));
      if (!row) continue;
      if (this.matches(row, where)) return row;
    }
    return null;
  }

  async findMany(model: string, where?: CleanedWhere[], limit?: number): Promise<Record<string, unknown>[]> {
    const ids = this.modelIndex.get(model) ?? [];
    const results: Record<string, unknown>[] = [];
    for (const id of ids) {
      const row = this.store.get(this.key(model, id));
      if (!row) continue;
      if (!where || this.matches(row, where)) {
        results.push(row);
        if (limit !== undefined && results.length >= limit) break;
      }
    }
    return results;
  }

  async update(model: string, where: CleanedWhere[], update: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const ids = this.modelIndex.get(model) ?? [];
    for (const id of ids) {
      const row = this.store.get(this.key(model, id));
      if (!row || !this.matches(row, where)) continue;
      const updated = { ...row, ...update };
      this.store.set(this.key(model, id), updated);
      return updated;
    }
    return null;
  }

  async delete(model: string, where: CleanedWhere[]): Promise<void> {
    const ids = this.modelIndex.get(model) ?? [];
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i]!;
      const row = this.store.get(this.key(model, id));
      if (row && this.matches(row, where)) {
        this.store.delete(this.key(model, id));
        ids.splice(i, 1);
      }
    }
    this.modelIndex.set(model, ids);
  }

  async count(model: string, where?: CleanedWhere[]): Promise<number> {
    return (await this.findMany(model, where)).length;
  }

  private matches(row: Record<string, unknown>, where: CleanedWhere[]): boolean {
    for (const clause of where) {
      const val = row[clause.field];
      const cmp = clause.value;
      switch (clause.operator) {
        case "eq":
          if (val !== cmp) return false;
          break;
        case "ne":
          if (val === cmp) return false;
          break;
        case "in":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!Array.isArray(cmp) || !(cmp as any[]).includes(val)) return false;
          break;
        case "not_in":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (Array.isArray(cmp) && (cmp as any[]).includes(val)) return false;
          break;
        case "contains":
          if (typeof val !== "string" || !val.includes(String(cmp))) return false;
          break;
        case "starts_with":
          if (typeof val !== "string" || !val.startsWith(String(cmp))) return false;
          break;
        case "ends_with":
          if (typeof val !== "string" || !val.endsWith(String(cmp))) return false;
          break;
        default:
          if (val !== cmp) return false;
      }
    }
    return true;
  }
}

/**
 * MikroOrmBetterAuthAdapter wires Better-Auth's CustomAdapter contract to
 * MikroORM EntityRepository calls.
 *
 * Usage: pass `this.createAdapter()` as the `database` option to `betterAuth()`.
 *
 * DB-backed models: user, session, account, verification, member, invitation.
 * In-memory fallback: any unrecognised model name Better-Auth may introduce.
 */
@Injectable()
export class MikroOrmBetterAuthAdapter {
  /** In-memory fallback for any unrecognised model names Better-Auth may introduce. */
  private readonly memStore = new InMemoryStore();

  constructor(private readonly em: EntityManager) {}

  /**
   * Returns a Better-Auth CustomAdapter bound to this instance's EntityManager.
   * Called once at AuthService construction time.
   */
  createAdapter(): CustomAdapter {
    return {
      create: this.create.bind(this) as CustomAdapter["create"],
      update: this.update.bind(this) as CustomAdapter["update"],
      updateMany: this.updateMany.bind(this) as CustomAdapter["updateMany"],
      findOne: this.findOne.bind(this) as CustomAdapter["findOne"],
      findMany: this.findMany.bind(this) as CustomAdapter["findMany"],
      delete: this.delete.bind(this) as CustomAdapter["delete"],
      deleteMany: this.deleteMany.bind(this) as CustomAdapter["deleteMany"],
      count: this.count.bind(this) as CustomAdapter["count"],
    };
  }

  // ──────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────

  private async create<T extends Record<string, unknown>>({
    model,
    data,
  }: {
    model: string;
    data: T;
    select?: string[];
  }): Promise<T> {
    const em = this.em.fork();

    if (model === "user") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapUserFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = em.create(User, mapped as any);
      em.persist(user);
      await em.flush();
      return this.mapUserToBetterAuth(user) as unknown as T;
    }

    if (model === "session") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapSessionFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = em.create(Session, mapped as any);
      em.persist(session);
      await em.flush();
      return this.mapSessionToBetterAuth(session) as unknown as T;
    }

    if (model === "member") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapMemberFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = em.create(OrgMember, mapped as any);
      em.persist(member);
      await em.flush();
      return this.mapMemberToBetterAuth(member) as unknown as T;
    }

    if (model === "invitation") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapInvitationFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = em.create(Invitation, mapped as any);
      em.persist(inv);
      await em.flush();
      return this.mapInvitationToBetterAuth(inv) as unknown as T;
    }

    if (model === "account") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapAccountFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = em.create(Account, mapped as any);
      em.persist(account);
      await em.flush();
      return this.mapAccountToBetterAuth(account) as unknown as T;
    }

    if (model === "verification") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = this.mapVerificationFromBetterAuth(data as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verification = em.create(Verification, mapped as any);
      em.persist(verification);
      await em.flush();
      return this.mapVerificationToBetterAuth(verification) as unknown as T;
    }

    // Fallback: rate-limit / any unrecognised model → in-memory
    return (await this.memStore.create(model, data as Record<string, unknown>)) as unknown as T;
  }

  // ──────────────────────────────────────────────────────────────
  // FIND ONE
  // ──────────────────────────────────────────────────────────────

  private async findOne<T>({
    model,
    where,
    join,
  }: {
    model: string;
    where: CleanedWhere[];
    select?: string[];
    join?: JoinConfig;
  }): Promise<T | null> {
    const em = this.em.fork();

    if (model === "user") {
      const query = buildWhere(where, USER_FIELD_MAP);
      if (query["email"]) {
        query["email"] = normalizeLocalAuthEmail(query["email"]);
      }
      // Default local email lookups to the local org when the caller has no session org.
      if (!query["orgId"] && query["email"]) {
        query["orgId"] = DEFAULT_ORG_ID;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await em.findOne(User, query as any);
      if (!user) return null;
      const output = this.mapUserToBetterAuth(user);
      if (join?.account) {
        const accounts = await em.find(Account, { userId: user.id });
        output["account"] = accounts.map((account) => this.mapAccountToBetterAuth(account));
      }
      return output as unknown as T;
    }

    if (model === "session") {
      const query = buildWhere(where, SESSION_FIELD_MAP);
      // Better-Auth may query by "token" which maps to Session.id
      if (query["token"]) {
        query["id"] = query["token"];
        delete query["token"];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = await em.findOne(Session, query as any);
      if (!session) return null;
      const output = this.mapSessionToBetterAuth(session);
      if (join?.user) {
        const user = await em.findOne(User, { id: session.userId });
        if (user) output["user"] = this.mapUserToBetterAuth(user);
      }
      return output as unknown as T;
    }

    if (model === "member") {
      const query = buildWhere(where, MEMBER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = await em.findOne(OrgMember, query as any);
      if (!member) return null;
      return this.mapMemberToBetterAuth(member) as unknown as T;
    }

    if (model === "invitation") {
      const query = buildWhere(where, INVITATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = await em.findOne(Invitation, query as any);
      if (!inv) return null;
      return this.mapInvitationToBetterAuth(inv) as unknown as T;
    }

    if (model === "account") {
      const query = buildWhere(where, ACCOUNT_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await em.findOne(Account, query as any);
      if (!account) return null;
      return this.mapAccountToBetterAuth(account) as unknown as T;
    }

    if (model === "verification") {
      const query = buildWhere(where, VERIFICATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verification = await em.findOne(Verification, query as any);
      if (!verification) return null;
      return this.mapVerificationToBetterAuth(verification) as unknown as T;
    }

    // rate-limit / unrecognised model → in-memory
    return (await this.memStore.findOne(model, where)) as unknown as T;
  }

  // ──────────────────────────────────────────────────────────────
  // FIND MANY
  // ──────────────────────────────────────────────────────────────

  private async findMany<T>({
    model,
    where,
    limit,
    sortBy,
    offset,
  }: {
    model: string;
    where?: CleanedWhere[];
    limit: number;
    select?: string[];
    sortBy?: { field: string; direction: "asc" | "desc" };
    offset?: number;
    join?: JoinConfig;
  }): Promise<T[]> {
    const em = this.em.fork();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = sortBy ? { [sortBy.field]: sortBy.direction } : undefined;

    if (model === "user") {
      const query = where ? buildWhere(where, USER_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = await em.find(User, query as any, { limit, offset, orderBy });
      return users.map((u) => this.mapUserToBetterAuth(u)) as unknown as T[];
    }

    if (model === "session") {
      const query = where ? buildWhere(where, SESSION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessions = await em.find(Session, query as any, { limit, offset, orderBy });
      return sessions.map((s) => this.mapSessionToBetterAuth(s)) as unknown as T[];
    }

    if (model === "member") {
      const query = where ? buildWhere(where, MEMBER_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = await em.find(OrgMember, query as any, { limit, offset, orderBy });
      return members.map((m) => this.mapMemberToBetterAuth(m)) as unknown as T[];
    }

    if (model === "invitation") {
      const query = where ? buildWhere(where, INVITATION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invitations = await em.find(Invitation, query as any, { limit, offset, orderBy });
      return invitations.map((i) => this.mapInvitationToBetterAuth(i)) as unknown as T[];
    }

    if (model === "account") {
      const query = where ? buildWhere(where, ACCOUNT_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = await em.find(Account, query as any, { limit, offset, orderBy });
      return accounts.map((a) => this.mapAccountToBetterAuth(a)) as unknown as T[];
    }

    if (model === "verification") {
      const query = where ? buildWhere(where, VERIFICATION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verifications = await em.find(Verification, query as any, { limit, offset, orderBy });
      return verifications.map((v) => this.mapVerificationToBetterAuth(v)) as unknown as T[];
    }

    // rate-limit / unrecognised model → in-memory
    return (await this.memStore.findMany(model, where, limit)) as unknown as T[];
  }

  // ──────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────

  private async update<T>({
    model,
    where,
    update,
  }: {
    model: string;
    where: CleanedWhere[];
    update: T;
  }): Promise<T | null> {
    const em = this.em.fork();
    const upd = update as Record<string, unknown>;

    if (model === "user") {
      const query = buildWhere(where, USER_FIELD_MAP);
      if (!query["orgId"] && query["email"]) query["orgId"] = DEFAULT_ORG_ID;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await em.findOne(User, query as any);
      if (!user) return null;
      const mapped = this.mapUserFromBetterAuth(upd);
      Object.assign(user, mapped);
      await em.flush();
      return this.mapUserToBetterAuth(user) as unknown as T;
    }

    if (model === "session") {
      const query = buildWhere(where, SESSION_FIELD_MAP);
      if (query["token"]) { query["id"] = query["token"]; delete query["token"]; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = await em.findOne(Session, query as any);
      if (!session) return null;
      const mapped = this.mapSessionFromBetterAuth(upd);
      Object.assign(session, mapped);
      await em.flush();
      return this.mapSessionToBetterAuth(session) as unknown as T;
    }

    if (model === "member") {
      const query = buildWhere(where, MEMBER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const member = await em.findOne(OrgMember, query as any);
      if (!member) return null;
      const mapped = this.mapMemberFromBetterAuth(upd);
      Object.assign(member, mapped);
      await em.flush();
      return this.mapMemberToBetterAuth(member) as unknown as T;
    }

    if (model === "invitation") {
      const query = buildWhere(where, INVITATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = await em.findOne(Invitation, query as any);
      if (!inv) return null;
      const mapped = this.mapInvitationFromBetterAuth(upd);
      Object.assign(inv, mapped);
      await em.flush();
      return this.mapInvitationToBetterAuth(inv) as unknown as T;
    }

    if (model === "account") {
      const query = buildWhere(where, ACCOUNT_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await em.findOne(Account, query as any);
      if (!account) return null;
      const mapped = this.mapAccountFromBetterAuth(upd);
      Object.assign(account, mapped);
      await em.flush();
      return this.mapAccountToBetterAuth(account) as unknown as T;
    }

    if (model === "verification") {
      const query = buildWhere(where, VERIFICATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verification = await em.findOne(Verification, query as any);
      if (!verification) return null;
      const mapped = this.mapVerificationFromBetterAuth(upd);
      Object.assign(verification, mapped);
      await em.flush();
      return this.mapVerificationToBetterAuth(verification) as unknown as T;
    }

    // in-memory fallback for rate-limit / unrecognised models
    return (await this.memStore.update(model, where, upd)) as unknown as T;
  }

  // ──────────────────────────────────────────────────────────────
  // UPDATE MANY
  // ──────────────────────────────────────────────────────────────

  private async updateMany({
    model,
    where,
    update,
  }: {
    model: string;
    where: CleanedWhere[];
    update: Record<string, unknown>;
  }): Promise<number> {
    const em = this.em.fork();

    if (model === "session") {
      const query = buildWhere(where, SESSION_FIELD_MAP);
      const mapped = this.mapSessionFromBetterAuth(update);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeUpdate(Session, query as any, mapped as any);
    }

    if (model === "member") {
      const query = buildWhere(where, MEMBER_FIELD_MAP);
      const mapped = this.mapMemberFromBetterAuth(update);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeUpdate(OrgMember, query as any, mapped as any);
    }

    if (model === "invitation") {
      const query = buildWhere(where, INVITATION_FIELD_MAP);
      const mapped = this.mapInvitationFromBetterAuth(update);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeUpdate(Invitation, query as any, mapped as any);
    }

    if (model === "account") {
      const query = buildWhere(where, ACCOUNT_FIELD_MAP);
      const mapped = this.mapAccountFromBetterAuth(update);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeUpdate(Account, query as any, mapped as any);
    }

    if (model === "verification") {
      const query = buildWhere(where, VERIFICATION_FIELD_MAP);
      const mapped = this.mapVerificationFromBetterAuth(update);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeUpdate(Verification, query as any, mapped as any);
    }

    // in-memory fallback for rate-limit / unrecognised models
    let count = 0;
    const rows = await this.memStore.findMany(model, where);
    for (const row of rows) {
      const id = row["id"] as string;
      await this.memStore.update(model, [{ field: "id", operator: "eq", value: id, connector: "AND" }], update);
      count++;
    }
    return count;
  }

  // ──────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────

  private async delete({ model, where }: { model: string; where: CleanedWhere[] }): Promise<void> {
    const em = this.em.fork();

    if (model === "session") {
      const query = buildWhere(where, SESSION_FIELD_MAP);
      if (query["token"]) { query["id"] = query["token"]; delete query["token"]; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(Session, query as any);
      return;
    }

    if (model === "user") {
      const query = buildWhere(where, USER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(User, query as any);
      return;
    }

    if (model === "member") {
      const query = buildWhere(where, MEMBER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(OrgMember, query as any);
      return;
    }

    if (model === "invitation") {
      const query = buildWhere(where, INVITATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(Invitation, query as any);
      return;
    }

    if (model === "account") {
      const query = buildWhere(where, ACCOUNT_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(Account, query as any);
      return;
    }

    if (model === "verification") {
      const query = buildWhere(where, VERIFICATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await em.nativeDelete(Verification, query as any);
      return;
    }

    await this.memStore.delete(model, where);
  }

  // ──────────────────────────────────────────────────────────────
  // DELETE MANY
  // ──────────────────────────────────────────────────────────────

  private async deleteMany({ model, where }: { model: string; where: CleanedWhere[] }): Promise<number> {
    const em = this.em.fork();

    if (model === "session") {
      const query = buildWhere(where, SESSION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(Session, query as any);
    }

    if (model === "user") {
      const query = buildWhere(where, USER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(User, query as any);
    }

    if (model === "member") {
      const query = buildWhere(where, MEMBER_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(OrgMember, query as any);
    }

    if (model === "invitation") {
      const query = buildWhere(where, INVITATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(Invitation, query as any);
    }

    if (model === "account") {
      const query = buildWhere(where, ACCOUNT_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(Account, query as any);
    }

    if (model === "verification") {
      const query = buildWhere(where, VERIFICATION_FIELD_MAP);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.nativeDelete(Verification, query as any);
    }

    const rows = await this.memStore.findMany(model, where);
    await this.memStore.delete(model, where);
    return rows.length;
  }

  // ──────────────────────────────────────────────────────────────
  // COUNT
  // ──────────────────────────────────────────────────────────────

  private async count({ model, where }: { model: string; where?: CleanedWhere[] }): Promise<number> {
    const em = this.em.fork();

    if (model === "user") {
      const query = where ? buildWhere(where, USER_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(User, query as any);
    }

    if (model === "session") {
      const query = where ? buildWhere(where, SESSION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(Session, query as any);
    }

    if (model === "member") {
      const query = where ? buildWhere(where, MEMBER_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(OrgMember, query as any);
    }

    if (model === "invitation") {
      const query = where ? buildWhere(where, INVITATION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(Invitation, query as any);
    }

    if (model === "account") {
      const query = where ? buildWhere(where, ACCOUNT_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(Account, query as any);
    }

    if (model === "verification") {
      const query = where ? buildWhere(where, VERIFICATION_FIELD_MAP) : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return em.count(Verification, query as any);
    }

    return this.memStore.count(model, where);
  }

  // ──────────────────────────────────────────────────────────────
  // FIELD MAPPERS — Better-Auth ↔ MikroORM entity properties
  // ──────────────────────────────────────────────────────────────

  private mapUserFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const now = new Date();
    const mapped: Record<string, unknown> = {
      ...(data["id"] !== undefined && { id: data["id"] }),
      ...(data["email"] !== undefined && { email: data["email"] as string }),
      ...(data["name"] !== undefined && { name: data["name"] as string | undefined }),
      ...((data["image"] !== undefined || data["avatarUrl"] !== undefined) && {
        avatarUrl: (data["image"] ?? data["avatarUrl"]) as string | undefined,
      }),
      ...(data["orgId"] !== undefined && { orgId: data["orgId"] as string }),
      ...(data["role"] !== undefined && { role: data["role"] as string }),
      ...(data["createdAt"] !== undefined && { createdAt: data["createdAt"] as Date }),
      ...(data["updatedAt"] !== undefined && { updatedAt: data["updatedAt"] as Date }),
    };
    if (data["email"] !== undefined) {
      if (mapped["orgId"] === undefined) mapped["orgId"] = DEFAULT_ORG_ID;
      if (mapped["role"] === undefined) mapped["role"] = "member";
      if (mapped["createdAt"] === undefined) mapped["createdAt"] = now;
      if (mapped["updatedAt"] === undefined) mapped["updatedAt"] = now;
    }
    return mapped;
  }

  private mapUserToBetterAuth(user: User): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      image: user.avatarUrl ?? null,
      emailVerified: false,  // Not in our schema; Better-Auth requires this field
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      orgId: user.orgId,
      role: user.role,
    };
  }

  private mapSessionFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const now = new Date();
    const mapped: Record<string, unknown> = {
      ...((data["token"] !== undefined || data["id"] !== undefined) && { id: (data["token"] ?? data["id"]) as string }),
      ...(data["userId"] !== undefined && { userId: data["userId"] as string }),
      ...((data["orgId"] !== undefined || data["activeOrganizationId"] !== undefined) && {
        orgId: (data["orgId"] ?? data["activeOrganizationId"]) as string,
        activeOrganizationId: (data["activeOrganizationId"] ?? data["orgId"]) as string,
      }),
      ...(data["expiresAt"] !== undefined && { expiresAt: data["expiresAt"] as Date }),
      ...(data["ipAddress"] !== undefined && { ipAddress: data["ipAddress"] as string | undefined }),
      ...(data["userAgent"] !== undefined && { userAgent: data["userAgent"] as string | undefined }),
      ...(data["createdAt"] !== undefined && { createdAt: data["createdAt"] as Date }),
    };
    if (data["userId"] !== undefined) {
      if (mapped["orgId"] === undefined) mapped["orgId"] = DEFAULT_ORG_ID;
      if (mapped["activeOrganizationId"] === undefined) mapped["activeOrganizationId"] = mapped["orgId"];
      if (mapped["createdAt"] === undefined) mapped["createdAt"] = now;
    }
    return mapped;
  }

  private mapSessionToBetterAuth(session: Session): Record<string, unknown> {
    return {
      id: session.id,
      token: session.id,  // Better-Auth uses "token" field on session
      userId: session.userId,
      orgId: session.orgId,
      activeOrganizationId: session.activeOrganizationId ?? session.orgId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
      createdAt: session.createdAt,
    };
  }

  private mapMemberFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
      ...(data["id"] !== undefined && { id: data["id"] }),
      ...((data["organizationId"] !== undefined || data["orgId"] !== undefined) && {
        orgId: (data["organizationId"] ?? data["orgId"]) as string,
      }),
      ...(data["userId"] !== undefined && { userId: data["userId"] as string }),
      ...(data["role"] !== undefined && { role: data["role"] as string }),
    };
    if ((mapped["orgId"] !== undefined || mapped["userId"] !== undefined) && mapped["role"] === undefined) {
      mapped["role"] = "member";
    }
    return mapped;
  }

  private mapMemberToBetterAuth(member: OrgMember): Record<string, unknown> {
    return {
      id: member.id,
      organizationId: member.orgId,
      userId: member.userId,
      role: member.role,
      createdAt: member.joinedAt,
    };
  }

  private mapInvitationFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {
      ...(data["id"] !== undefined && { id: data["id"] }),
      ...((data["organizationId"] !== undefined || data["orgId"] !== undefined) && {
        orgId: (data["organizationId"] ?? data["orgId"]) as string,
      }),
      ...(data["email"] !== undefined && { email: data["email"] as string }),
      ...(data["role"] !== undefined && { role: data["role"] as string }),
      ...(data["token"] !== undefined && { token: data["token"] as string }),
      ...(data["inviterId"] !== undefined && { invitedById: data["inviterId"] as string | undefined }),
      ...(data["expiresAt"] !== undefined && { expiresAt: data["expiresAt"] as Date }),
    };
    if ((mapped["orgId"] !== undefined || mapped["email"] !== undefined || mapped["token"] !== undefined) && mapped["role"] === undefined) {
      mapped["role"] = "member";
    }
    if ((mapped["orgId"] !== undefined || mapped["email"] !== undefined || mapped["token"] !== undefined) && mapped["expiresAt"] === undefined) {
      mapped["expiresAt"] = new Date(Date.now() + 7 * 86400_000);
    }
    return mapped;
  }

  private mapInvitationToBetterAuth(inv: Invitation): Record<string, unknown> {
    return {
      id: inv.id,
      organizationId: inv.orgId,
      email: inv.email,
      role: inv.role,
      token: inv.token,
      inviterId: inv.invitedById ?? null,
      expiresAt: inv.expiresAt,
      status: inv.acceptedAt ? "accepted" : "pending",
      createdAt: inv.createdAt,
    };
  }

  private mapAccountFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const now = new Date();
    const mapped: Record<string, unknown> = {
      ...(data["id"] !== undefined && { id: data["id"] }),
      ...(data["userId"] !== undefined && { userId: data["userId"] as string }),
      ...(data["providerId"] !== undefined && { providerId: data["providerId"] as string }),
      ...(data["accountId"] !== undefined && { accountId: data["accountId"] as string }),
      ...(data["accessToken"] !== undefined && { accessToken: (data["accessToken"] ?? null) as string | undefined }),
      ...(data["refreshToken"] !== undefined && { refreshToken: (data["refreshToken"] ?? null) as string | undefined }),
      ...(data["accessTokenExpiresAt"] !== undefined && { accessTokenExpiresAt: (data["accessTokenExpiresAt"] ?? null) as Date | undefined }),
      ...(data["refreshTokenExpiresAt"] !== undefined && { refreshTokenExpiresAt: (data["refreshTokenExpiresAt"] ?? null) as Date | undefined }),
      ...(data["scope"] !== undefined && { scope: (data["scope"] ?? null) as string | undefined }),
      ...(data["idToken"] !== undefined && { idToken: (data["idToken"] ?? null) as string | undefined }),
      ...(data["password"] !== undefined && { password: (data["password"] ?? null) as string | undefined }),
      ...(data["createdAt"] !== undefined && { createdAt: data["createdAt"] as Date }),
      ...(data["updatedAt"] !== undefined && { updatedAt: data["updatedAt"] as Date }),
    };
    if (data["userId"] !== undefined) {
      if (mapped["createdAt"] === undefined) mapped["createdAt"] = now;
      if (mapped["updatedAt"] === undefined) mapped["updatedAt"] = now;
    }
    return mapped;
  }

  private mapAccountToBetterAuth(account: Account): Record<string, unknown> {
    return {
      id: account.id,
      userId: account.userId,
      providerId: account.providerId,
      accountId: account.accountId,
      accessToken: account.accessToken ?? null,
      refreshToken: account.refreshToken ?? null,
      accessTokenExpiresAt: account.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt ?? null,
      scope: account.scope ?? null,
      idToken: account.idToken ?? null,
      password: account.password ?? null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private mapVerificationFromBetterAuth(data: Record<string, unknown>): Record<string, unknown> {
    const now = new Date();
    const mapped: Record<string, unknown> = {
      ...(data["id"] !== undefined && { id: data["id"] }),
      ...(data["identifier"] !== undefined && { identifier: data["identifier"] as string }),
      ...(data["value"] !== undefined && { value: data["value"] as string }),
      ...(data["expiresAt"] !== undefined && { expiresAt: data["expiresAt"] as Date }),
      ...(data["createdAt"] !== undefined && { createdAt: data["createdAt"] as Date }),
      ...(data["updatedAt"] !== undefined && { updatedAt: data["updatedAt"] as Date }),
    };
    if (data["identifier"] !== undefined || data["value"] !== undefined) {
      if (mapped["createdAt"] === undefined) mapped["createdAt"] = now;
      if (mapped["updatedAt"] === undefined) mapped["updatedAt"] = now;
    }
    return mapped;
  }

  private mapVerificationToBetterAuth(verification: Verification): Record<string, unknown> {
    return {
      id: verification.id,
      identifier: verification.identifier,
      value: verification.value,
      expiresAt: verification.expiresAt,
      createdAt: verification.createdAt,
      updatedAt: verification.updatedAt,
    };
  }
}
