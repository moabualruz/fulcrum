#!/usr/bin/env bun
// fulcrum — local-first CLI Agent OS. Binary entry-point.

import { installCliLogRedaction } from "./log.ts";
import { ROOT_HELP, STAGE_HELP_TOPICS, renderStageHelp } from "./help.ts";

installCliLogRedaction();

const VERSION = "0.1.0";
const BUILD_DATE = process.env["FULCRUM_BUILD_DATE"] ?? "dev";
const COMMIT = process.env["FULCRUM_COMMIT"] ?? "dev";

const INDEX_DISPATCH_ROOTS = new Set([
  "agent",
  "branch",
  "config",
  "context",
  "cycle",
  "doc",
  "e2e",
  "mission",
  "module",
  "note",
  "operate",
  "plan",
  "plugin",
  "pr",
  "profile",
  "prototype",
  "qa",
  "release",
  "repo",
  "review",
  "run",
  "ship",
  "trace",
  "uat",
  "workspace",
]);

function printVersion(argv: readonly string[]): void {
  const result = {
    version: VERSION,
    commit: COMMIT,
    build_date: BUILD_DATE,
  };
  if (argv.includes("--json")) {
    console.log(
      JSON.stringify({
        schema: "fulcrum.cli.v1",
        trace_id: process.env["FULCRUM_TRACE_ID"] ?? "trace-cli-version",
        span_id: null,
        run_id: null,
        project_id: null,
        command: "fulcrum version",
        args: {},
        result,
        errors: [],
        next_actions: [],
        duration_ms: 0,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }
  console.log(VERSION);
}

async function main() {
  const argv = Bun.argv.slice(2);
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "hook": {
      const [name, ...args] = rest;
      if (!name) {
        console.error("usage: fulcrum hook <name>");
        process.exit(2);
      }
      await runHook(name, args);
      return;
    }
    case "hooks": {
      const { run: runHooks } = await import("./hooks.ts");
      await runHooks(rest);
      return;
    }
    case "skills": {
      const { run: runSkills } = await import("./skills.ts");
      await runSkills(rest);
      return;
    }
    case "init": {
      const { run: runInit } = await import("./init.ts");
      await runInit(rest);
      return;
    }
    case "install": {
      const { run: runInstall } = await import("./install.ts");
      await runInstall(rest);
      return;
    }
    case "uninstall": {
      const { run: runUninstall } = await import("./uninstall.ts");
      await runUninstall(rest);
      return;
    }
    case "doctor": {
      const { run } = await import("./index.ts");
      await run([cmd, ...rest]);
      return;
    }
    case "compress": {
      const { run: runCompress } = await import("./compress.ts");
      await runCompress(rest);
      return;
    }
    case "mcp": {
      const { run: runMcp } = await import("./mcp-cmd.ts");
      await runMcp(rest);
      return;
    }
    case "component": {
      const { run: runComponent } = await import("./component.ts");
      await runComponent(rest);
      return;
    }
    case "product": {
      const { run: runProduct } = await import("./product.ts");
      await runProduct(rest);
      return;
    }
    case "export": {
      const { run: runExport } = await import("./export.ts");
      await runExport(rest);
      return;
    }
    case "import": {
      const { run: runImport } = await import("./import.ts");
      await runImport(rest);
      return;
    }
    case "settings": {
      const { run } = await import("./index.ts");
      await run([cmd, ...rest]);
      return;
    }
    case "completion": {
      const { run: runCompletion } = await import("./completion.ts");
      await runCompletion(rest);
      return;
    }
    case "version":
    case "--version":
    case "-V": {
      printVersion(rest);
      return;
    }
    case "--json": {
      if (rest.includes("--version") || rest.includes("-V")) {
        printVersion([cmd, ...rest]);
        return;
      }
      const { run } = await import("./index.ts");
      await run([cmd, ...rest]);
      return;
    }
    case "parity":
    case "auth":
    case "flags":
    case "routing":
    case "route":
    case "db":
    case "web":
    case "tui":
    case "inference":
    case "agents":
    case "projects":
    case "capture":
    case "task":
    case "tasks":
    case "sprints":
    case "memory":
    case "search":
    case "ship":
    case "artifacts":
    case "artifact":
    case "repos":
    case "repo":
    case "docs":
    case "symphony":
    case "runs":
    case "session":
    case "ai":
    case "mode":
    case "context":
    case "notify":
    case "audit":
    case "webhooks":
    case "connectors":
    case "components":
    case "relationships":
    case "comments":
    case "templates":
    case "automations":
    case "recurrence":
    case "saved_views":
    case "taskCustomFields":
    case "customFieldDefs": {
      const { run } = await import("./index.ts");
      await run([cmd, ...rest]);
      return;
    }
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
      if (INDEX_DISPATCH_ROOTS.has(cmd)) {
        const { run } = await import("./index.ts");
        await run([cmd, ...rest]);
        return;
      }
      console.error(`fulcrum: unknown command '${cmd}'`);
      if (cmd === "projcts") {
        console.error("Did you mean 'projects'?");
      }
      console.error(ROOT_HELP);
      process.exit(1);
  }
}

async function runHook(name: string, _args: string[]) {
  // Set hook name for error reporting in readHookEvent()
  process.env["FULCRUM_HOOK_NAME"] = name;

  switch (name) {
    case "router":
    case "tool-output-router": {
      const { run } = await import("@platform-core/application/agent-hooks/tool-output-router.ts");
      await run();
      return;
    }
    case "format": {
      const { runHook } = await import("@platform-core/application/agent-hooks/format.ts");
      await runHook();
      return;
    }
    case "lint-gate": {
      const { runHook } = await import("@platform-core/application/agent-hooks/lint-gate.ts");
      await runHook();
      return;
    }
    case "pm-policy": {
      const { runHook } = await import("@platform-core/application/agent-hooks/pm-policy.ts");
      await runHook();
      return;
    }
    case "test-on-edit": {
      const { runHook } = await import("@platform-core/application/agent-hooks/test-on-edit.ts");
      await runHook();
      return;
    }
    case "audit-log": {
      const { runHook } = await import("@platform-core/application/agent-hooks/audit-log.ts");
      await runHook();
      return;
    }
    case "index-check": {
      const { runHook } = await import("@platform-core/application/agent-hooks/index-check.ts");
      await runHook();
      return;
    }
    case "index-rebuild": {
      const { runHook } = await import("@platform-core/application/agent-hooks/index-rebuild.ts");
      await runHook();
      return;
    }
    default:
      console.error(`fulcrum: unknown hook recipe '${name}'`);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`fulcrum: fatal: ${(err as Error).message}`);
  process.exit(1);
});
