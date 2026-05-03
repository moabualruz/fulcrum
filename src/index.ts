#!/usr/bin/env bun
// fulcrum — multi-agent foundation CLI.

import { GENERATED_DOMAIN_COMMANDS, isGeneratedDomainCommand } from "./cli/generated-domains.ts";

const GENERATED_DOMAIN_HELP = GENERATED_DOMAIN_COMMANDS.map((name) => `  fulcrum ${name} ...`).join("\n");

const HELP = `fulcrum — multi-agent foundation CLI

Usage:
  fulcrum init                       Bootstrap local org + admin session.
  fulcrum auth <whoami|invite|login|logout>
                                     Manage local CLI authentication.
  fulcrum flags <list|set> [--json]  Manage feature flags.
  fulcrum routing rules <list|add|edit|delete> [--json]
                                     Manage task routing rules.
  fulcrum routing <assign|simulate> [--json]
                                     Test task routing decisions.
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
  Generated domains:
${GENERATED_DOMAIN_HELP}
  fulcrum doctor                     Report bun, agent dirs, tool presence, policy health.
  fulcrum version                    Print version.
  fulcrum help                       This message.

Environment:
  FULCRUM_HOME           override ~/.fulcrum
  FULCRUM_POLICY         override ~/.fulcrum/tool-output-policy.toml
  FULCRUM_HEAD_LINES     head lines for summary tiers (default 20)
`;

const VERSION = "0.1.0";

const HAND_WRITTEN_COMMANDS = [
  "init",
  "auth",
  "flags",
  "routing",
  "docs",
  "db",
  "web",
  "tui",
  "inference",
  "symphony",
  "runs",
  "notify",
  "audit",
  "webhooks",
  "connectors",
  "hook",
  "hooks",
  "skills",
  "install",
  "uninstall",
  "doctor",
  "compress",
  "mcp",
  "component",
  "product",
  "version",
  "help",
] as const;

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? i) + 1,
        (previous[j] ?? j) + 1,
        (previous[j - 1] ?? j) + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length] ?? a.length;
}

function suggestCommand(command: string): string | null {
  const candidates = [...HAND_WRITTEN_COMMANDS, ...GENERATED_DOMAIN_COMMANDS];
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(command, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate));
  const best = ranked[0];
  if (!best || best.distance > Math.max(2, Math.floor(command.length / 3))) return null;
  return best.candidate;
}

export async function run(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "init":
    case "auth":
    case "flags":
    case "routing":
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
    case "runs":
    case "notify":
    case "audit":
    case "webhooks":
    case "connectors": {
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
    case isGeneratedDomainCommand(cmd) ? cmd : undefined:
      console.error(`fulcrum: generated domain '${cmd}' is scaffolded, but runtime tRPC invocation is not wired yet`);
      process.exit(1);
      return;
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
      {
        const suggestion = suggestCommand(cmd);
        if (suggestion) console.error(`Did you mean '${suggestion}'?`);
      }
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
