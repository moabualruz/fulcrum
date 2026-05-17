import { randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  OrganizationMemberEntity,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  ALGO_LABEL,
  decrypt,
  encrypt,
  KDF_LABEL,
} from "@platform-core/application/secrets/vault.ts";
import {
  loadOrCreateMasterKey,
  requireMasterKey,
  type KeyringConfig,
} from "@platform-core/application/secrets/keyring.ts";
import {
  type FulcrumCredential,
  FulcrumCredentialEntity,
} from "@platform-core/infrastructure/database/credential.entities.ts";

export interface CredentialPublicRow {
  id: string;
  name: string;
  archived: boolean;
  provider: string;
  algo: string;
  kdf: string;
  lastUsedAt: string | null;
  createdAt: string | null;
}

export class CredentialPermissionError extends Error {}

export class CredentialStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId: string;
    userId: string;
    includeArchived?: boolean;
  }): Promise<CredentialPublicRow[]> {
    await this.requireActiveMembership(input);
    const credentials = await this.credentialRepository().find({
      where: {
        orgId: input.orgId,
        userId: input.userId,
        ...(input.includeArchived ? {} : { archived: false }),
      },
      order: { createdAt: "DESC", id: "ASC" },
    });
    return credentials.map(serializeCredential);
  }

  async get(input: {
    orgId: string;
    userId: string;
    name: string;
    targetUserId?: string;
    keyring: KeyringConfig;
  }): Promise<{ name: string; value: string } | null> {
    const targetUserId = input.targetUserId ?? input.userId;
    await this.assertCanAct(input, targetUserId);
    const credential = await this.findCredential(input.orgId, targetUserId, input.name);
    if (!credential) return null;
    const { key } = await requireMasterKey(input.keyring);
    const value = new TextDecoder().decode(decrypt(key, Buffer.from(credential.encryptedValue, "base64")));
    return { name: credential.name, value };
  }

  async set(input: {
    orgId: string;
    userId: string;
    name: string;
    value: string;
    keyring: KeyringConfig;
  }): Promise<{ id: string; name: string }> {
    await this.requireActiveMembership(input);
    const { key } = await loadOrCreateMasterKey(input.keyring);
    const encryptedValue = Buffer.from(encrypt(key, input.value)).toString("base64");
    const existing = await this.findCredential(input.orgId, input.userId, input.name);
    if (existing) {
      existing.encryptedValue = encryptedValue;
      existing.algo = ALGO_LABEL;
      existing.kdf = KDF_LABEL;
      existing.archived = false;
      const saved = await this.credentialRepository().save(existing);
      return { id: saved.id, name: saved.name };
    }
    const saved = await this.credentialRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      name: input.name,
      encryptedValue,
      algo: ALGO_LABEL,
      kdf: KDF_LABEL,
      provider: "local",
      archived: false,
      lastUsedAt: null,
    });
    return { id: saved.id, name: saved.name };
  }

  async rotate(input: {
    orgId: string;
    userId: string;
    name: string;
    newValue: string;
    targetUserId?: string;
    keyring: KeyringConfig;
  }): Promise<boolean> {
    const targetUserId = input.targetUserId ?? input.userId;
    await this.assertCanAct(input, targetUserId);
    const credential = await this.findCredential(input.orgId, targetUserId, input.name);
    if (!credential) return false;
    const { key } = await loadOrCreateMasterKey(input.keyring);
    credential.encryptedValue = Buffer.from(encrypt(key, input.newValue)).toString("base64");
    credential.algo = ALGO_LABEL;
    credential.kdf = KDF_LABEL;
    credential.lastUsedAt = new Date();
    await this.credentialRepository().save(credential);
    return true;
  }

  async archive(input: {
    orgId: string;
    userId: string;
    name: string;
    targetUserId?: string;
  }): Promise<boolean> {
    const targetUserId = input.targetUserId ?? input.userId;
    await this.assertCanAct(input, targetUserId);
    const credential = await this.findCredential(input.orgId, targetUserId, input.name);
    if (!credential) return false;
    credential.archived = true;
    await this.credentialRepository().save(credential);
    return true;
  }

  async remove(input: {
    orgId: string;
    userId: string;
    name: string;
    targetUserId?: string;
  }): Promise<boolean> {
    const targetUserId = input.targetUserId ?? input.userId;
    await this.assertCanAct(input, targetUserId);
    const result = await this.credentialRepository().delete({ orgId: input.orgId, userId: targetUserId, name: input.name });
    return Number(result.affected ?? 0) > 0;
  }

  private async assertCanAct(input: { orgId: string; userId: string }, targetUserId: string): Promise<void> {
    const membership = await this.requireActiveMembership(input);
    if (targetUserId === input.userId) return;
    if (membership.role === "owner" || membership.role === "admin") return;
    throw new CredentialPermissionError("Only the credential owner or organization admins can operate on this credential.");
  }

  private async requireActiveMembership(input: { orgId: string; userId: string }): Promise<{ role: string }> {
    const membership = await this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!membership) throw new CredentialPermissionError("Active organization membership required for credential access.");
    return membership;
  }

  private async findCredential(orgId: string, userId: string, name: string): Promise<FulcrumCredential | null> {
    return await this.credentialRepository().findOneBy({ orgId, userId, name });
  }

  private credentialRepository() {
    return this.dataSource.getRepository(FulcrumCredentialEntity);
  }
}

function serializeCredential(credential: FulcrumCredential): CredentialPublicRow {
  return {
    id: credential.id,
    name: credential.name,
    archived: credential.archived,
    provider: credential.provider,
    algo: credential.algo,
    kdf: credential.kdf,
    lastUsedAt: dateString(credential.lastUsedAt ?? undefined),
    createdAt: dateString(credential.createdAt),
  };
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
