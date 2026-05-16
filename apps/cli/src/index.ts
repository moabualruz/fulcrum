#!/usr/bin/env bun

/**
 * fulcrum CLI entry-point.
 *
 * Commands default to public API clients. Only local runtime entry points such
 * as init, web, db migration, and interactive TUI startup open
 * the local application container.
 */

import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildLocalApplicationContainer,
  startLocalWorkflowSupervisor,
  verifyLocalApplicationMigrations,
  type LocalApplicationContainer,
} from "@platform-core/application/runtime/local-application-container.ts";

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
  fulcrum runs <list|show|cancel|retry|dispatch|preview|feed|worker-tick|logs> [--json]
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
export async function buildDbContainer(): Promise<LocalApplicationContainer> {
  return buildLocalApplicationContainer();
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function runWeb(_argv: readonly string[]): Promise<void> {
  const { container, cleanup } = await buildDbContainer();
  let cleanupOnStartupFailure = true;

  try {
    console.log("Application database initialized");
    console.log("Application container ready");

    await verifyLocalApplicationMigrations(container);
    console.log("Migrations up-to-date");

    const outputRoot = join(process.cwd(), "apps", "web", ".svelte-kit", "output");
    const serverIndex = join(outputRoot, "server", "index.js");
    const manifestPath = join(outputRoot, "server", "manifest.js");
    const clientRoot = join(outputRoot, "client");

    if (!(await exists(serverIndex)) || !(await exists(manifestPath))) {
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

    const workflowSupervisor = await startLocalWorkflowSupervisor(container);

    cleanupOnStartupFailure = false;
    console.log(`Web server listening on http://localhost:${listener.port}`);
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    }).finally(async () => {
      workflowSupervisor.stop();
      listener.stop(true);
      await cleanup();
    });
  } finally {
    if (cleanupOnStartupFailure) {
      await cleanup();
    }
  }
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

      await runProjects(rest);
      return;
    }
    case "tasks": {
      const { run: runTasks } = await import("./commands/tasks.ts");
      await runTasks(rest);
      return;
    }
    case "work": {
      const { run: runWork } = await import("./commands/work.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runWork(rest);
        return;
      }

      await runWork(rest);
      return;
    }
    case "sprints": {
      const { run: runSprints } = await import("./commands/sprints.ts");
      await runSprints(rest);
      return;
    }
    case "auth": {
      const { run: runAuth } = await import("./commands/auth.ts");
      await runAuth(rest);
      return;
    }
    case "flags": {
      const { run: runFlags } = await import("./commands/flags.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runFlags(rest);
        return;
      }

      await runFlags(rest);
      return;
    }
    case "routing": {
      const { run: runRouting } = await import("./commands/routing.ts");
      await runRouting(rest);
      return;
    }
    case "repos": {
      const { run: runRepos } = await import("./commands/repos.ts");
      await runRepos(rest);
      return;
    }
    case "docs": {
      const { run: runDocsCommand } = await import("./commands/docs.ts");
      await runDocsCommand(rest);
      return;
    }
    case "memory": {
      const { run: runMemory } = await import("./commands/memory.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runMemory(rest);
        return;
      }
      await runMemory(rest);
      return;
    }
    case "search": {
      const { run: runSearch } = await import("./commands/search.ts");
      const [sub = "help"] = rest;
      if (sub === "help" || sub === "--help" || sub === "-h") {
        await runSearch(rest);
        return;
      }

      await runSearch(rest);
      return;
    }
    case "artifacts": {
      const { run: runArtifacts } = await import("./commands/artifacts.ts");
      await runArtifacts(rest);
      return;
    }
    case "db": {
      const { run: runDb } = await import("./commands/db.ts");
      if (rest[0] === "status" && rest.includes("--json")) {
        await runDb(rest, null);
        return;
      }
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
      await runSymphony(rest);
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

      await runPillar14Command(cmd, rest);
      return;
    }
    case "settings": {
      const { run: runSettings } = await import("./settings.ts");
      await runSettings(rest);
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
      const { runTheme } = await import("./commands/cross-cutting-platform.ts");
      await runTheme(rest);
      return;
    }
    case "telemetry": {
      const { runTelemetry } = await import("./commands/cross-cutting-platform.ts");
      await runTelemetry(rest);
      return;
    }
    case "backup": {
      const { runBackup } = await import("./commands/cross-cutting-platform.ts");
      await runBackup(rest);
      return;
    }
    case "data": {
      const { runDataExport, runDataImport } = await import("./commands/cross-cutting-platform.ts");
      const [sub = "help", ...dataRest] = rest;
      if (sub === "export") {
        await runDataExport(dataRest);
        return;
      }
      if (sub === "import") {
        await runDataImport(dataRest);
        return;
      }
      console.error(`fulcrum data: unknown command '${sub}'`);
      process.exit(2);
    }
    case "secrets": {
      const { runSecrets, runSecretsInitKeyring } = await import("./commands/cross-cutting-platform.ts");
      if (rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h") {
        await runSecrets(rest);
        return;
      }
      if (rest[0] === "init-keyring") {
        await runSecretsInitKeyring(rest.slice(1));
        return;
      }
      await runSecrets(rest);
      return;
    }
    case "errors": {
      const { runErrors } = await import("./commands/cross-cutting-platform.ts");
      await runErrors(rest);
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
      await runTui(rest);
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
