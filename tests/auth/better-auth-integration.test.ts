/**
 * Better-Auth v1 integration tests — RED → GREEN.
 *
 * Acceptance criteria (from issue #05):
 *   1. After SeedService.run(), sessionRepo.findOne({ user: { email: 'admin@local' } })
 *      returns a row (i.e., the seed planted a session with a valid userId mapping back
 *      to the admin user).
 *   2. AuthService is constructable from the needle-di container.
 *   3. auth.handler returns a Response (not an unhandled throw) on GET /api/auth/session.
 *   4. MikroOrmBetterAuthAdapter can be instantiated with an EntityManager.
 *
 * Per C6: NO raw SQL strings outside src/db/migrations/.
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 * Per C8: needle-di @injectable() / inject() pattern.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { Container } from "@needle-di/core";

import { PGliteKyselyDialect } from "../../src/db/PGliteKyselyDriver.ts";
import { createOrmConfig } from "../../src/db/mikro-orm.config.ts";
import { registerDbBindings, SessionRepository } from "../../src/db/db.module.ts";
import { SeedService } from "../../src/db/seed.ts";
import { AuthService } from "../../src/auth/index.ts";
import { MikroOrmBetterAuthAdapter } from "../../src/auth/adapter.ts";

let orm: MikroORM;
let container: Container;

beforeAll(async () => {
  const pglite = new PGlite();
  orm = await MikroORM.init(createOrmConfig({ pglite }));
  await orm.schema.create();

  container = new Container();
  registerDbBindings(container, orm);

  // Register AuthService
  container.bind({ provide: AuthService, useFactory: () => new AuthService(orm.em) });

  // Run seed so admin@local + local org + session exist
  const seed = new SeedService(orm.em);
  await seed.run();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

// ─────────────────────────────────────────────────────────────────
// 1. Seed check — session row exists for admin@local
// ─────────────────────────────────────────────────────────────────

describe("SeedService + SessionRepository integration", () => {
  it("sessionRepo.findOne returns a session for admin@local userId", async () => {
    const em = orm.em.fork();

    // Find user first (admin@local)
    const { User, Session } = await import("../../src/db/entities/auth/index.ts");
    const adminUser = await em.findOne(User, { email: "admin@local" });
    expect(adminUser).not.toBeNull();

    // Find session by userId via forked EM (not global context)
    const session = await em.findOne(Session, { userId: adminUser!.id });
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(adminUser!.id);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. AuthService is constructable
// ─────────────────────────────────────────────────────────────────

describe("AuthService construction", () => {
  it("AuthService is resolvable from needle-di container", () => {
    const authService = container.get(AuthService);
    expect(authService).toBeDefined();
    expect(authService).toBeInstanceOf(AuthService);
  });

  it("AuthService exposes a handler property", () => {
    const authService = container.get(AuthService);
    expect(authService.handler).toBeDefined();
    expect(typeof authService.handler).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. auth.handler returns 200 on GET /api/auth/session
// ─────────────────────────────────────────────────────────────────

describe("auth.handler GET /api/auth/session", () => {
  it("returns a Response object (not a throw) on unauthenticated GET /api/auth/get-session", async () => {
    const authService = container.get(AuthService);
    // Better-Auth exposes /get-session (not /session)
    const request = new Request("http://localhost/api/auth/get-session", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const response = await authService.handler(request);
    expect(response).toBeInstanceOf(Response);
    // Unauthenticated get-session returns 200 with null session
    expect(response.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
// 4. MikroOrmBetterAuthAdapter construction
// ─────────────────────────────────────────────────────────────────

describe("MikroOrmBetterAuthAdapter", () => {
  it("can be instantiated with EntityManager", () => {
    const adapter = new MikroOrmBetterAuthAdapter(orm.em);
    expect(adapter).toBeDefined();
    expect(typeof adapter.createAdapter).toBe("function");
  });
});
