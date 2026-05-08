#!/usr/bin/env bun

/**
 * fulcrum CLI entry-point.
 *
 * P1#19 (HIGH 3): The `db` subcommand requires a real needle-di Container
 * backed by a live MikroORM instance. We build the container here, at the
 * top level, so every subcommand receives a properly wired container rather
 * than null (which would throw at db.router.ts:get(MigratorService)).
 *
 * For commands that do not need a DB connection (e.g. `help`, `init`), we
 * still build the container lazily — only `db` subcommands trigger ORM init.
 */

import { mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Container } from "@needle-di/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { createOrmConfig } from "@/db/mikro-orm.config.ts";
import { resolveDatabaseConfig } from "@/config/database.ts";
import {
  registerDbBindings,
  SchemaMigrationRepository,
} from "@/db/db.module.ts";
import { dbCanRunOnCurrentBinary } from "@/db/doctor-checks.ts";

const HELP = `fulcrum

Usage:
  fulcrum init
  fulcrum auth <whoami|invite|login|logout> [options]
  fulcrum projects <list|stats> [--json]
  fulcrum tasks <list|get|create|update|delete> [--json]
  fulcrum work <create|inspect|move|link|report> [--json]
  fulcrum sprints <list|get|create|update|delete|add-task|remove-task> [--json]
  fulcrum flags <list|set> [options]
  fulcrum routing rules <list|add|edit|delete> [options]
  fulcrum routing <assign|simulate> [options]
  fulcrum repos <register|list|sync|unregister|status> [options]
  fulcrum docs template list [--json]
  fulcrum symphony runs list --state ready [--json]
  fulcrum agents <list|profile|test> [--json]
  fulcrum runs <list|show|cancel|retry|logs> [--json]
  fulcrum notify list [--unread] [--json|--watch]
  fulcrum settings <list|get|set> [--json]
  fulcrum memory <list|get|add|delete|search|promote> [--json]
  fulcrum search query <query> [--json]
  fulcrum artifacts <list|show|download|archive|unarchive|delete> [--json]
  fulcrum components status [--json]
  fulcrum doctor [--json]
  fulcrum completion --shell <bash|zsh|fish|powershell>
  fulcrum audit <query|export> [--json]
  fulcrum i18n <list|set> [--json]
  fulcrum theme <list|set> [--json]
  fulcrum telemetry <status|opt-in|opt-out|purge> [--json]
  fulcrum backup <create|restore|verify> [--json]
  fulcrum data <export|import> [--json]
  fulcrum secrets <set|get|rotate|init-keyring> [--json]
  fulcrum errors <list|get|purge> [--json]
  fulcrum webhooks <list|test> [--json]
  fulcrum connectors <enable|sync> <id> [--json]
  fulcrum db <migrate|status|history> [options]
  fulcrum web
  fulcrum tui
  fulcrum inference <start|status|embed|generate|stop> [--json]
`;

export function resolveClientAssetPath(clientRoot: string, requestPath: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (pathname.includes("\0")) return null;

  const baseRoot = resolve(clientRoot);
  const rootedPath = pathname.startsWith("/") ? `.${pathname}` : `./${pathname}`;
  const assetPath = resolve(baseRoot, rootedPath);

  if (assetPath === baseRoot || assetPath.startsWith(`${baseRoot}${sep}`)) {
    return assetPath;
  }

  return null;
}

/**
 * Build a Container backed by a local PGlite ORM instance.
 * Used by the `db` subcommand so it has a real MigratorService.
 *
 * Returns the container and a cleanup function to close the ORM.
 */
async function buildDbContainer(): Promise<{ container: Container; cleanup: () => Promise<void> }> {
  const database = resolveDatabaseConfig();
  if (database.backend === "postgres") {
    const config = createOrmConfig({ debug: false });
    const orm = await MikroORM.init({
      ...config,
      extensions: [Migrator],
    });
    const container = new Container();
    container.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(container, orm);
    return {
      container,
      cleanup: async () => {
        await orm.close(true);
      },
    };
  }

  await mkdir(database.dataDir, { recursive: true });
  const [{ PGlite }, { PGliteKyselyDialect }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@/db/PGliteKyselyDriver.ts"),
  ]);
  const pglite = new PGlite(database.dataDir);
  await pglite.waitReady;
  const dialect = new PGliteKyselyDialect(() => pglite);
  const config = createOrmConfig({ pglite, debug: false });
  const orm = await MikroORM.init({
    ...config,
    driverOptions: dialect,
    extensions: [Migrator],
  });

  const container = new Container();
  container.bind({ provide: MikroORM, useValue: orm });
  registerDbBindings(container, orm);

  return {
    container,
    cleanup: async () => {
      await orm.close(true);
      await pglite.close();
    },
  };
}

type MigrationInfoLike = { name?: string };
type MigratorCompat = {
  getPendingMigrations?: () => Promise<MigrationInfoLike[]>;
  getPending?: () => Promise<MigrationInfoLike[]>;
};

async function pendingMigrations(migrator: MigratorCompat): Promise<MigrationInfoLike[]> {
  if (migrator.getPendingMigrations) return migrator.getPendingMigrations();
  if (migrator.getPending) return migrator.getPending();
  return [];
}

async function verifyMigrationCompatibility(
  orm: MikroORM,
  container: Container,
): Promise<void> {
  const pending = await pendingMigrations(orm.migrator as MigratorCompat);
  if (pending.length > 0) {
    const names = pending.map((migration) => migration.name ?? "(unknown)").join(", ");
    throw new Error(`migrations pending: ${names}. Run \`fulcrum db migrate\` before \`fulcrum web\`.`);
  }

  const schemaMigrationRepo = container.get(SchemaMigrationRepository);
  const binaryCheck = await dbCanRunOnCurrentBinary(schemaMigrationRepo);
  if (binaryCheck.status === "fail") {
    throw new Error(binaryCheck.detail);
  }

  console.log("Migrations up-to-date");
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function runWeb(_argv: readonly string[]): Promise<void> {
  const { container, cleanup } = await buildDbContainer();
  console.log("MikroORM initialized");
  console.log("needle-di container ready");

  const orm = container.get(MikroORM);
  await verifyMigrationCompatibility(orm, container);

  const outputRoot = join(process.cwd(), "apps", "web", ".svelte-kit", "output");
  const serverIndex = join(outputRoot, "server", "index.js");
  const manifestPath = join(outputRoot, "server", "manifest.js");
  const clientRoot = join(outputRoot, "client");

  if (!(await exists(serverIndex)) || !(await exists(manifestPath))) {
    await cleanup();
    throw new Error("web build missing. Run `bun --cwd apps/web run build` before `fulcrum web`.");
  }

  const [{ Server }, { manifest }] = await Promise.all([
    import(pathToFileURL(serverIndex).href) as Promise<{
      Server: new (manifest: unknown) => {
        init(opts: {
          env: Record<string, string | undefined>;
          read: (file: string) => ReadableStream<Uint8Array>;
        }): Promise<void>;
        respond(request: Request, options: {
          platform: Record<string, never>;
          getClientAddress: () => string;
        }): Promise<Response>;
      };
    }>,
    import(pathToFileURL(manifestPath).href) as Promise<{ manifest: unknown }>,
  ]);

  const server = new Server(manifest);
  await server.init({
    env: process.env,
    read: (file: string) => {
      const assetPath = resolveClientAssetPath(clientRoot, file);
      if (!assetPath) throw new Error(`invalid client asset path: ${file}`);
      return Bun.file(assetPath).stream();
    },
  });

  const port = Number(process.env["PORT"] ?? "3000");
  const listener = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (pathname !== "/" && !pathname.endsWith("/")) {
        const assetPath = resolveClientAssetPath(clientRoot, pathname);
        if (!assetPath) return new Response("Not found", { status: 404 });
        const asset = Bun.file(assetPath);
        if (await asset.exists()) return new Response(asset);
      }

      return server.respond(request, {
        platform: {},
        getClientAddress: () => "127.0.0.1",
      });
    },
  });

  const [{ DEFAULT_ORG_ID }, { WorkflowConfigSchema }, { startSymphonyOrchestrator }] =
    await Promise.all([
      import("@/db/seed.ts"),
      import("@/orchestration/symphony/schemas.ts"),
      import("@/orchestration/symphony/orchestrator.ts"),
    ]);
  const symphony = startSymphonyOrchestrator(
    orm.em,
    DEFAULT_ORG_ID,
    WorkflowConfigSchema.parse({}),
  );

  console.log(`Web server listening on http://localhost:${listener.port}`);
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).finally(async () => {
    symphony.stop();
    listener.stop(true);
    await cleanup();
  });
}

export async function run(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "init": {
      const { run: runInit } = await import("./commands/init.ts");
      await runInit(rest);
      return;
    }
    case "agents": {
      const { run: runAgents } = await import("./commands/agents.ts");
      await runAgents(rest);
      return;
    }
    case "projects": {
      const { run: runProjects } = await import("./commands/projects.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runProjects(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runProjects(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "tasks": {
      const { run: runTasks } = await import("./commands/tasks.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runTasks(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runTasks(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "work": {
      const { run: runWork } = await import("./commands/work.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runWork(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runWork(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "sprints": {
      const { run: runSprints } = await import("./commands/sprints.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runSprints(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runSprints(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "auth": {
      const { run: runAuth } = await import("./commands/auth.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h" || sub === "login" || sub === "logout") {
        await runAuth(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runAuth(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "flags": {
      const { run: runFlags } = await import("./commands/flags.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runFlags(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runFlags(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "routing": {
      const { run: runRouting } = await import("./commands/routing.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runRouting(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runRouting(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "repos": {
      const { run: runRepos } = await import("./commands/repos.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runRepos(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runRepos(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "docs": {
      const { run: runDocsCommand } = await import("./commands/docs.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runDocsCommand(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runDocsCommand(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "memory": {
      const { run: runMemory } = await import("./commands/memory.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runMemory(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runMemory(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "search": {
      const { run: runSearch } = await import("./commands/search.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runSearch(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runSearch(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "artifacts": {
      const { run: runArtifacts } = await import("./commands/artifacts.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runArtifacts(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runArtifacts(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "db": {
      const { run: runDb } = await import("./commands/db.ts");
      if (rest[0] === "status" && rest.includes("--json")) {
        await runDb(rest, null);
        return;
      }
      // Build a real container backed by a live ORM instance.
      // PermissionNotAvailableError will surface loudly until P1#06 lands.
      const { container, cleanup } = await buildDbContainer();
      try {
        await runDb(rest, container);
      } finally {
        await cleanup();
      }
      return;
    }
    case "symphony": {
      const { run: runSymphony } = await import("./commands/symphony.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h" || sub === "conformance") {
        await runSymphony(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runSymphony(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "runs":
    case "notify":
    case "audit":
    case "webhooks":
    case "connectors": {
      const { runPillar14Command } = await import("./commands/pillar14-generated.ts");
      const helpOnly = rest.includes("--help") || rest.includes("-h") || rest[0] === "help";
      if (helpOnly) {
        await runPillar14Command(cmd, rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runPillar14Command(cmd, rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "settings": {
      const { run: runSettings } = await import("./settings.ts");
      const helpOnly = rest.includes("--help") || rest.includes("-h") || rest[0] === "help";
      if (helpOnly) {
        await runSettings(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        const { createLocalCaller } = await import("./local-caller.ts");
        await runSettings(rest, { caller: await createLocalCaller({ container }) } as never);
      } finally {
        await cleanup();
      }
      return;
    }
    case "components":
    case "component": {
      const { run: runComponent } = await import("./component.ts");
      await runComponent(rest);
      return;
    }
    case "i18n": {
      const { runI18n } = await import("./commands/cross-cutting-platform.ts");
      await runI18n(rest);
      return;
    }
    case "theme": {
      const [{ runTheme }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      const { container, cleanup } = await buildDbContainer();
      try {
        await runTheme(rest, { caller: await createLocalCaller({ container }) });
      } finally {
        await cleanup();
      }
      return;
    }
    case "telemetry": {
      const [{ runTelemetry }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      const { container, cleanup } = await buildDbContainer();
      try {
        await runTelemetry(rest, { caller: await createLocalCaller({ container }) });
      } finally {
        await cleanup();
      }
      return;
    }
    case "backup": {
      const [{ runBackup }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      const { container, cleanup } = await buildDbContainer();
      try {
        await runBackup(rest, { caller: await createLocalCaller({ container }) });
      } finally {
        await cleanup();
      }
      return;
    }
    case "data": {
      const [{ runDataExport, runDataImport }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      const [sub = "help", ...dataRest] = rest;
      const { container, cleanup } = await buildDbContainer();
      try {
        const caller = await createLocalCaller({ container });
        if (sub === "export") {
          await runDataExport(dataRest, { caller });
          return;
        }
        if (sub === "import") {
          await runDataImport(dataRest, { caller });
          return;
        }
      } finally {
        await cleanup();
      }
      console.error(`fulcrum data: unknown command '${sub}'`);
      process.exit(2);
    }
    case "secrets": {
      const [{ runSecrets, runSecretsInitKeyring }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      if (rest[0] === "init-keyring") {
        await runSecretsInitKeyring(rest.slice(1));
        return;
      }
      const { container, cleanup } = await buildDbContainer();
      try {
        await runSecrets(rest, { caller: await createLocalCaller({ container }) });
      } finally {
        await cleanup();
      }
      return;
    }
    case "errors": {
      const [{ runErrors }, { createLocalCaller }] = await Promise.all([
        import("./commands/cross-cutting-platform.ts"),
        import("./local-caller.ts"),
      ]);
      const { container, cleanup } = await buildDbContainer();
      try {
        await runErrors(rest, { caller: await createLocalCaller({ container }) });
      } finally {
        await cleanup();
      }
      return;
    }
    case "doctor": {
      const { run: runDoctor } = await import("./doctor.ts");
      await runDoctor(rest);
      return;
    }
    case "completion": {
      const { run: runCompletion } = await import("./completion.ts");
      await runCompletion(rest);
      return;
    }
    case "web":
      await runWeb(rest);
      return;
    case "tui": {
      const { run: runTui } = await import("./commands/tui.ts");
      const helpOnly = rest.includes("--help") || rest.includes("-h") || rest.includes("--no-tui");
      const isTTY = process.stdout.isTTY && process.stdin.isTTY;
      if (helpOnly || !isTTY) {
        await runTui(rest);
        return;
      }

      const { container, cleanup } = await buildDbContainer();
      try {
        await runTui(rest, { container });
      } finally {
        await cleanup();
      }
      return;
    }
    case "inference": {
      const { run: runInference } = await import("./inference.ts");
      await runInference(rest);
      return;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`fulcrum: unknown command '${cmd}'`);
      console.error(HELP);
      process.exit(2);
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(`fulcrum: fatal: ${(error as Error).message}`);
    process.exit(1);
  });
}
