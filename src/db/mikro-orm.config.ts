/**
 * MikroORM v7 configuration — single source of truth.
 *
 * Driver selection:
 *   - LOCAL (default): PGlite via a custom Kysely dialect adapter.
 *   - SAAS: @mikro-orm/postgresql (standard pg Pool) when DATABASE_URL points to a server.
 *
 * C6: No plaintext SQL in this file.
 * C7: MikroORM v7 + @Entity decorator-class entities.
 * C9: Config lives here; entities registered per domain.
 */

import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import type { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "./PGliteKyselyDriver.ts";

// Entity classes — imported here so all consumers get a consistent list.
// Uses @Entity decorator classes (C7: ES Stage-3 decorators).
import { User } from "./entities/auth/User.ts";
import { Session } from "./entities/auth/Session.ts";
import { Invitation } from "./entities/auth/Invitation.ts";
import { OrgMember } from "./entities/auth/OrgMember.ts";
import { FeatureFlag } from "./entities/auth/FeatureFlag.ts";

export {
  User,
  Session,
  Invitation,
  OrgMember,
  FeatureFlag,
};

/** Allowed options for createOrmConfig(). */
export interface OrmConfigOptions {
  /** Pre-constructed PGlite instance (for local + test mode). */
  pglite?: PGlite;
  /** Extra entities to register (in addition to the built-in list). */
  entities?: Options["entities"];
  /** Enable MikroORM debug logging. */
  debug?: boolean;
}

/**
 * Builds a MikroORM Options object.
 *
 * - When `pglite` is provided → uses the PGlite Kysely dialect (local/test mode).
 * - When DATABASE_URL starts with "postgresql://" or "postgres://" → uses the
 *   standard @mikro-orm/postgresql driver (SaaS mode).
 * - Defaults to in-memory PGlite when neither is present.
 */
export function createOrmConfig(opts: OrmConfigOptions = {}): Options {
  const { pglite, entities = [], debug = false } = opts;
  const dbUrl = process.env["DATABASE_URL"] ?? "";

  const isSaas =
    dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

  // Built-in auth domain entities (decorator classes)
  const builtinEntities: Options["entities"] = [
    User,
    Session,
    Invitation,
    OrgMember,
    FeatureFlag,
  ];

  const allEntities: Options["entities"] = [...builtinEntities, ...entities];

  if (isSaas) {
    // SaaS: standard PostgreSQL driver
    return {
      dbName: new URL(dbUrl).pathname.slice(1) || "fulcrum",
      clientUrl: dbUrl,
      entities: allEntities,
      migrations: {
        path: new URL("./migrations", import.meta.url).pathname,
        pathTs: new URL("./migrations", import.meta.url).pathname,
      },
      extensions: [Migrator],
      debug,
    };
  }

  // Local / test: PGlite via PGliteKyselyDialect
  const getPglite = pglite
    ? () => pglite
    : () => import("@electric-sql/pglite").then(({ PGlite }) => new PGlite());

  const dialect = new PGliteKyselyDialect(getPglite);

  return {
    // dbName is required by MikroORM even though PGlite ignores it
    dbName: "postgres",
    // Pass our dialect as driverOptions — AbstractSqlConnection checks for createDriver()
    driverOptions: dialect,
    // PGlite does not support multiple statements in a single prepared query.
    // Setting false causes SqlSchemaGenerator to split DDL on ';\n' before executing.
    multipleStatements: false,
    entities: allEntities,
    migrations: {
      path: new URL("./migrations", import.meta.url).pathname,
      pathTs: new URL("./migrations", import.meta.url).pathname,
    },
    extensions: [Migrator],
    debug,
  };
}

/** Convenience: initialise an ORM instance with the standard config. */
export async function initOrm(opts: OrmConfigOptions = {}): Promise<MikroORM> {
  const { MikroORM } = await import("@mikro-orm/postgresql");
  return MikroORM.init(createOrmConfig(opts));
}
