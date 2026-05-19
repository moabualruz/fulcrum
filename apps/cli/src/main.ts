#!/usr/bin/env bun
// fulcrum — multi-agent foundation CLI.

import { installCliLogRedaction } from "./log.ts";

installCliLogRedaction();

const HELP = `fulcrum — multi-agent foundation CLI

Usage:
  fulcrum init [DIR]                 Bootstrap a project (AGENTS.md, .claude/CLAUDE.md, .gitignore).
  fulcrum hook <name> [args...]      Run a hook recipe (reads JSON envelope on stdin).
                                     Recipes: format, lint-gate, pm-policy, test-on-edit,
                                              audit-log, index-check, index-rebuild, router
  fulcrum hooks list                 List available hook recipes.
  fulcrum hooks enable <name>        Register a hook in each detected agent config.
  fulcrum skills sync                Mirror authored skills; Codex global scope is opt-in.
  fulcrum skills upstream [--update-pins]
                                     Mirror curated third-party skills to agents; --update-pins
                                     computes and writes subpath_sha256 for unpinned entries.
  fulcrum skills lint <path>         Validate a SKILL.md (frontmatter + required body sections).
  fulcrum skills list [--installed]  Enumerate authored skills, or installed skill budgets.
  fulcrum install [--profile minimal|rules-only|full] [--with-project DIR]
                  [--no-skills] [--no-upstream-skills]
                  [--no-default-mcps] [--enable-all-mcps]
                                     Splice rules, vendor hooks, sync skills, install caveman.
                                     Default profile is minimal; full keeps historical bootstrap.
                                     --enable-all-mcps: enable every builtin MCP across all agents.
  fulcrum uninstall [--dry-run] [--purge] [--include-caveman]
                                     Remove Fulcrum-managed install artifacts.
  fulcrum compress [--check] [FILES...]
                                     Compress markdown with caveman; default targets shown in help.
  fulcrum mcp list [--json]          List registered MCP servers.
  fulcrum mcp register <name> [--http URL | --stdio CMD] [--vendor V] ...
                                     Register an MCP server in the registry.
  fulcrum mcp unregister <name>      Unregister and remove from all agents.
  fulcrum mcp enable <name> [--agent <id> ...] [--all-agents]
                                     Enable server and push to agents.
  fulcrum mcp disable <name> [--agent <id> ...] [--all-agents]
                                     Disable server and remove from agents.
  fulcrum component list [--json]    List Fulcrum components.
  fulcrum components status [--json] Show component lifecycle status.
  fulcrum component info <id> [--json]
                                     Show component details and surfaces.
  fulcrum component plan <install|remove|enable|disable> <component> [--agent <id>] [--all-agents] [--json]
                                     Plan component changes without applying them.
  fulcrum auth <whoami|invite|login|logout>
  fulcrum flags <list|set> [options]
  fulcrum routing rules <list|add|edit|delete> [options]
  fulcrum db <migrate|status|history> [options]
  fulcrum web
  fulcrum tui
  fulcrum inference <start|status|embed|generate|stop> [--json]
  fulcrum projects|tasks|sprints|relationships|comments|templates|automations|recurrence|saved_views|taskCustomFields
  fulcrum memory|search|artifacts|credentials|webhooks|repos|docs|runs|notify|audit|connectors
  fulcrum settings <list|get|set> [--json]
  fulcrum ai start --task <id> --title <title> [--json]
  fulcrum completion --shell <bash|zsh|fish|powershell>
  fulcrum product init [--json]      Initialise the local product kernel (PGlite + migrations).
  fulcrum product projects list [--json]
                                     List product-kernel projects.
  fulcrum product search <query> [--org-slug <slug>] [--limit <N>] [--json]
                                     Run an FTS query over the product kernel search index.
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
                                     Render the assembled Markdown context for a task.
  fulcrum capture <review|status|action> [--json]
                                     Review mobile captures, set status, run quick actions.
  fulcrum product planning preview --plan <id> --file <path> [--project <id>] [--trace <id>] [--json]
                                     Preview approved-plan docs/tasks/dependencies through shared planning API.
  fulcrum product planning materialize --plan <id> --file <path> [--project <id>] [--trace <id>] [--json]
                                     Persist approved-plan docs/tasks/dependencies through shared planning API.
  fulcrum doctor [--json] [--subsystem <name>] [--checks] [--probe]
                                     Report bun, agent dirs, tool presence, policy health.
                                     --subsystem runs only named subsystem checks via orchestrator.
                                     --checks includes modular orchestrator checks in legacy report.
  fulcrum version                    Print version.
  fulcrum help                       This message.

Environment:
  FULCRUM_HOME           override ~/.fulcrum
  FULCRUM_POLICY         override ~/.fulcrum/tool-output-policy.toml
  FULCRUM_HEAD_LINES     head lines for summary tiers (default 20)
`;

const VERSION = "0.1.0";

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
    case "auth":
    case "flags":
    case "routing":
    case "db":
    case "web":
    case "tui":
    case "inference":
    case "agents":
    case "projects":
    case "capture":
    case "tasks":
    case "sprints":
    case "memory":
    case "search":
    case "artifacts":
    case "repos":
    case "docs":
    case "symphony":
    case "runs":
    case "session":
    case "ai":
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
    case "customFieldDefs":
    case "completion": {
      const { run } = await import("./index.ts");
      await run([cmd, ...rest]);
      return;
    }
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`fulcrum: unknown command '${cmd}'`);
      if (cmd === "projcts") {
        console.error("Did you mean 'projects'?");
      }
      console.error(HELP);
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
