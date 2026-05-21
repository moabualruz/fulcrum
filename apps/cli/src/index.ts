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

import { HELP, ROOT_HELP, STAGE_HELP_TOPICS, renderStageHelp } from "./help.ts";
import { emitResult } from "./lib/cli-output.ts";

export { HELP, ROOT_HELP, STAGE_HELP_TOPICS, renderStageHelp };

const CANONICAL_POINTERS: Readonly<Record<string, { stage: string; alias: string; note: string }>> = {
  branch: {
    stage: "ship",
    alias: "fulcrum repo branches <id>",
    note: "Branch inspection is routed through the repository supervisor.",
  },
  config: {
    stage: "operate",
    alias: "fulcrum settings",
    note: "Configuration reads and writes are routed through settings.",
  },
  cycle: {
    stage: "build",
    alias: "fulcrum sprints",
    note: "Cycle planning is currently represented by sprint commands.",
  },
  doc: {
    stage: "capture",
    alias: "fulcrum docs",
    note: "Document capture and templates are routed through docs.",
  },
  e2e: {
    stage: "review",
    alias: "fulcrum product reports e2e-run",
    note: "E2E review reporting is routed through product report commands.",
  },
  mission: {
    stage: "plan",
    alias: "fulcrum product planning",
    note: "Mission shaping is routed through planning commands.",
  },
  module: {
    stage: "build",
    alias: "fulcrum component",
    note: "Module lifecycle inspection is routed through component commands.",
  },
  note: {
    stage: "capture",
    alias: "fulcrum capture",
    note: "Notes enter the workflow through Capture.",
  },
  plan: {
    stage: "plan",
    alias: "fulcrum product planning",
    note: "Plan commands are routed through product planning.",
  },
  pr: {
    stage: "ship",
    alias: "fulcrum repo",
    note: "Pull-request state belongs to repository supervision.",
  },
  profile: {
    stage: "operate",
    alias: "fulcrum settings",
    note: "Profile settings are routed through settings.",
  },
  prototype: {
    stage: "plan",
    alias: "fulcrum product planning preview",
    note: "Prototype previews are routed through planning preview commands.",
  },
  qa: {
    stage: "review",
    alias: "fulcrum product reports uat-handoff",
    note: "QA handoff is routed through product report commands.",
  },
  release: {
    stage: "ship",
    alias: "fulcrum artifact",
    note: "Release outputs are routed through artifact commands.",
  },
  review: {
    stage: "review",
    alias: "fulcrum product reports decision",
    note: "Review decisions are routed through product report commands.",
  },
  run: {
    stage: "build",
    alias: "fulcrum runs",
    note: "Singular run commands are routed through the runs command group.",
  },
  uat: {
    stage: "review",
    alias: "fulcrum product reports uat-handoff",
    note: "UAT handoff is routed through product report commands.",
  },
  workspace: {
    stage: "cross-cutting",
    alias: "fulcrum projects",
    note: "Workspace scope is routed through project commands.",
  },
};

function runCanonicalPointer(root: string, argv: readonly string[]): void {
  const pointer = CANONICAL_POINTERS[root];
  if (!pointer) throw new Error(`missing canonical pointer for ${root}`);
  const verb = argv.find((arg) => !arg.startsWith("-")) ?? "help";
  const result = {
    root,
    stage: pointer.stage,
    accepted: true,
    compatibility_alias: pointer.alias,
    message: `\`fulcrum ${root}\` is accepted by the CLI-TUI-UX command contract. ${pointer.note}`,
  };

  emitResult(
    {
      argv,
      command: `fulcrum ${root} ${verb}`,
      args: { root, argv },
      result,
      next_actions: [
        { label: `Use ${pointer.alias}`, command: pointer.alias },
      ],
      renderHuman: (value) => {
        console.log(value.message);
        console.log(`Compatibility alias: ${value.compatibility_alias}`);
      },
    },
    { print: console.log, printErr: console.error },
  );
}

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
      const { run: runInit } = await import("./init.ts");
      await runInit(rest);
      return;
    }
    case "agents": {
      const { run: runAgents } = await import("./commands/agents.ts");
      await runAgents(rest, { commandRoot: "agents" });
      return;
    }
    case "agent": {
      const { run: runAgents } = await import("./commands/agents.ts");
      await runAgents(rest, { commandRoot: "agent" });
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
    case "capture": {
      const { run: runCapture } = await import("./commands/capture.ts");
      await runCapture(rest);
      return;
    }
    case "task":
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
    case "route": {
      const { run: runRouting } = await import("./commands/routing.ts");
      await runRouting(rest);
      return;
    }
    case "repos": {
      const { run: runRepos } = await import("./commands/repos.ts");
      await runRepos(rest);
      return;
    }
    case "repo": {
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
    case "artifact": {
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
    case "session": {
      const { createLocalSessionCommandHost, runSessionCommand } = await import("./commands/session.ts");
      const { host, cleanup } = await createLocalSessionCommandHost();
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        const result = await runSessionCommand(rest, host, {
          stdout: process.stdout,
          stderr: process.stderr,
          signal: controller.signal,
        });
        if (result.exitCode !== 0) process.exit(result.exitCode);
      } finally {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        await cleanup();
      }
      return;
    }
    case "settings": {
      const { run: runSettings } = await import("./settings.ts");
      await runSettings(rest);
      return;
    }
    case "trace": {
      const { run: runTrace } = await import("./commands/trace.ts");
      await runTrace(rest);
      return;
    }
    case "operate": {
      const { run: runOperate } = await import("./commands/operate-plugins.ts");
      await runOperate(rest, { invocationRoot: "operate" });
      return;
    }
    case "plugin": {
      // `fulcrum plugin …` is the CLI-TUI-UX.md §1.6 root alias for
      // `fulcrum operate plugin …`. It reaches the same Operate plugin host;
      // `invocationRoot: "plugin"` keeps the `fulcrum.cli.v1` envelope honest
      // about which canonical grammar the operator used.
      const { run: runOperate } = await import("./commands/operate-plugins.ts");
      await runOperate(["plugin", ...rest], { invocationRoot: "plugin" });
      return;
    }
    case "ai": {
      const { run: runAi } = await import("./commands/ai.ts");
      await runAi(rest);
      return;
    }
    case "mode": {
      const { run: runMode } = await import("./commands/mode.ts");
      await runMode(rest);
      return;
    }
    case "components":
    case "component": {
      const { run: runComponent } = await import("./component.ts");
      await runComponent(rest);
      return;
    }
    case "relationships":
    case "comments":
    case "templates":
    case "automations":
    case "recurrence":
    case "saved_views":
    case "taskCustomFields":
    case "customFieldDefs": {
      const { runGeneratedCommand } = await import("./generated-command-runner.ts");
      await runGeneratedCommand(cmd, rest);
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
    case "offline": {
      const { run: runOffline } = await import("./commands/offline.ts");
      await runOffline(rest);
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
    case "parity": {
      const [sub = "help", ...parityRest] = rest;
      if (sub === "cli-tui") {
        const { run: runCliTuiParity } = await import("./commands/cli-tui-parity.ts");
        await runCliTuiParity(parityRest);
        return;
      }
      console.error(`fulcrum parity: unknown command '${sub}'`);
      process.exit(2);
    }
    case "web":
      if (rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h") {
        console.log("fulcrum web — open the web shell. Build first with `bun --cwd apps/web run build`.");
        return;
      }
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
    case "context": {
      const { run: runContext } = await import("./commands/context.ts");
      await runContext(rest);
      return;
    }
    case "branch":
    case "config":
    case "cycle":
    case "doc":
    case "e2e":
    case "mission":
    case "module":
    case "note":
    case "plan":
    case "pr":
    case "profile":
    case "prototype":
    case "qa":
    case "release":
    case "review":
    case "run":
    case "uat":
    case "workspace":
      runCanonicalPointer(cmd, rest);
      return;
    case "help":
    case "--help":
    case "-h": {
      const [topic] = rest;
      if (topic) {
        const stageHelp = renderStageHelp(topic);
        if (stageHelp) {
          console.log(stageHelp);
          return;
        }
        console.error(`fulcrum help: unknown stage '${topic}'`);
        console.error(`Known stages: ${STAGE_HELP_TOPICS.join(", ")}`);
        process.exit(2);
      }
      console.log(ROOT_HELP);
      return;
    }
    default:
      console.error(`fulcrum: unknown command '${cmd}'`);
      console.error(ROOT_HELP);
      process.exit(2);
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(`fulcrum: fatal: ${(error as Error).message}`);
    process.exit(1);
  });
}
