#!/usr/bin/env bun
// fulcrum — multi-agent foundation CLI.

const HELP = `fulcrum — multi-agent foundation CLI

Usage:
  fulcrum init                       Bootstrap local org + admin session.
  fulcrum auth <whoami|invite|login|logout>
                                     Manage local CLI authentication.
  fulcrum flags <list|set> [--json]  Manage feature flags.
  fulcrum docs template list [--json]
                                     List seeded documentation templates.
  fulcrum db <migrate|status|history>
                                     Manage local schema migrations.
  fulcrum web                        Start the SvelteKit web server.
  fulcrum tui                        Start the TUI (stub).
  fulcrum inference start|status|stop [--json]
                                     Manage the local inference sidecar.
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
  fulcrum component info <id> [--json]
                                     Show component details and surfaces.
  fulcrum component plan <install|remove|enable|disable> <component> [--agent <id>] [--all-agents] [--json]
                                     Plan component changes without applying them.
  fulcrum product init [--json]      Initialise the local product kernel (PGlite + migrations).
  fulcrum product projects list [--json]
                                     List product-kernel projects.
  fulcrum product search <query> [--org-slug <slug>] [--limit <N>] [--json]
                                     Run an FTS query over the product kernel search index.
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
                                     Render the assembled Markdown context for a task.
  fulcrum symphony runs list --state ready [--json]
                                     List Symphony candidate tasks ready for dispatch.
  fulcrum doctor                     Report bun, agent dirs, tool presence, policy health.
  fulcrum version                    Print version.
  fulcrum help                       This message.

Environment:
  FULCRUM_HOME           override ~/.fulcrum
  FULCRUM_POLICY         override ~/.fulcrum/tool-output-policy.toml
  FULCRUM_HEAD_LINES     head lines for summary tiers (default 20)
`;

const VERSION = "0.1.0";

export async function run(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "init":
    case "auth":
    case "flags":
    case "docs":
    case "db":
    case "web":
    case "tui":
    case "inference":
    case "symphony": {
      const { run: runCli } = await import("./cli/index.ts");
      await runCli([cmd, ...rest]);
      return;
    }
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
      const { run: runHooks } = await import("./cli/hooks.ts");
      await runHooks(rest);
      return;
    }
    case "skills": {
      const { run: runSkills } = await import("./cli/skills.ts");
      await runSkills(rest);
      return;
    }
    case "install": {
      const { run: runInstall } = await import("./cli/install.ts");
      await runInstall(rest);
      return;
    }
    case "uninstall": {
      const { run: runUninstall } = await import("./cli/uninstall.ts");
      await runUninstall(rest);
      return;
    }
    case "doctor": {
      const { run: runDoctor } = await import("./cli/doctor.ts");
      await runDoctor(rest);
      return;
    }
    case "compress": {
      const { run: runCompress } = await import("./cli/compress.ts");
      await runCompress(rest);
      return;
    }
    case "mcp": {
      const { run: runMcp } = await import("./cli/mcp-cmd.ts");
      await runMcp(rest);
      return;
    }
    case "component": {
      const { run: runComponent } = await import("./cli/component.ts");
      await runComponent(rest);
      return;
    }
    case "product": {
      const { run: runProduct } = await import("./cli/product.ts");
      await runProduct(rest);
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
      const { run } = await import("./hooks/tool-output-router.ts");
      await run();
      return;
    }
    case "format": {
      const { runHook } = await import("./hooks/format.ts");
      await runHook();
      return;
    }
    case "lint-gate": {
      const { runHook } = await import("./hooks/lint-gate.ts");
      await runHook();
      return;
    }
    case "pm-policy": {
      const { runHook } = await import("./hooks/pm-policy.ts");
      await runHook();
      return;
    }
    case "test-on-edit": {
      const { runHook } = await import("./hooks/test-on-edit.ts");
      await runHook();
      return;
    }
    case "audit-log": {
      const { runHook } = await import("./hooks/audit-log.ts");
      await runHook();
      return;
    }
    case "index-check": {
      const { runHook } = await import("./hooks/index-check.ts");
      await runHook();
      return;
    }
    case "index-rebuild": {
      const { runHook } = await import("./hooks/index-rebuild.ts");
      await runHook();
      return;
    }
    default:
      console.error(`fulcrum: unknown hook recipe '${name}'`);
      process.exit(2);
  }
}

if (import.meta.main) {
  run().catch((err) => {
    console.error(`fulcrum: fatal: ${(err as Error).message}`);
    process.exit(1);
  });
}
