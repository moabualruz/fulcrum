import { afterAll, describe, expect, test } from "bun:test";

import { AppUnauthorizedError } from "@platform-core/domain/errors.ts";
import { DataSource } from "typeorm";
import {
  createApplicationLocalCaller,
  requireCliTuiSessionContext,
  resolveCliTuiAuthContextFromContainer,
} from "./local-caller.ts";
import { createTestOrm, destroyTestOrm } from "@test-support/application-database.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import type { DiContainer } from "@platform-core/application/runtime/di-container.ts";

afterAll(async () => {
  await destroyTestOrm();
});

describe("CLI/TUI local caller session boundary", () => {
  test("missing required sessions raise application errors before tRPC caller creation", async () => {
    await expect(createApplicationLocalCaller({ requireSession: true }))
      .rejects.toBeInstanceOf(AppUnauthorizedError);

    await expect(requireCliTuiSessionContext())
      .rejects.toBeInstanceOf(AppUnauthorizedError);
  });

  test("local session resolution returns the same enriched auth envelope used by HTTP and tRPC", async () => {
    const orm = await createTestOrm();
    const expiresAt = new Date(Date.now() + 60_000);
    await orm.em.save(Session, {
      id: "session-local-caller",
      userId: orm.seed.userId,
      orgId: orm.seed.orgId,
      activeOrganizationId: orm.seed.orgId,
      expiresAt,
      createdAt: new Date(),
      ipAddress: undefined,
      userAgent: "fulcrum-test",
    });
    const container: DiContainer = {
      get: (token: unknown) => {
        if (token === DataSource) return orm.ds as never;
        throw new Error(`Token not found in container: ${String(token)}`);
      },
      has: (token) => token === DataSource,
      bind: () => undefined,
    };

    await expect(resolveCliTuiAuthContextFromContainer({ container })).resolves.toMatchObject({
      userId: orm.seed.userId,
      orgId: orm.seed.orgId,
      activeOrgId: orm.seed.orgId,
      sessionId: "session-local-caller",
      sessionExpiresAt: expiresAt.toISOString(),
      email: "admin@local",
      role: "owner",
      orgName: "Local",
    });
    await expect(requireCliTuiSessionContext({ container })).resolves.toMatchObject({
      orgId: orm.seed.orgId,
      userId: orm.seed.userId,
      auth: {
        sessionId: "session-local-caller",
        role: "owner",
      },
    });
  });
});
