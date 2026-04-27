#!/usr/bin/env bun
// fulcrum — multi-agent foundation CLI.

const HELP = `fulcrum — multi-agent foundation CLI

Usage:
  fulcrum init [DIR]                 Bootstrap a project (AGENTS.md, .claude/CLAUDE.md, .gitignore).
  fulcrum hook <name> [args...]      Run a hook recipe (reads JSON envelope on stdin).
                                     Recipes: format, lint-gate, pm-policy, test-on-edit,
                                              audit-log, index-check, index-rebuild, router
  fulcrum hooks list                 List available hook recipes.
  fulcrum hooks enable <name>        Print the per-agent registration snippet for <name>.
  fulcrum skills sync                Mirror skills/<name>/ to every agent's skills path.
  fulcrum skills lint <path>         Validate a SKILL.md frontmatter against all 5 agents.
  fulcrum install [--with-project DIR]
                                     Splice rules into agent files; vendor recipe pool.
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
      const { run: runHooks } = await import("./cli/hooks.ts");
      await runHooks(rest);
      return;
    }
    case "skills": {
      const { run: runSkills } = await import("./cli/skills.ts");
      await runSkills(rest);
      return;
    }
    case "init": {
      const { run: runInit } = await import("./cli/init.ts");
      await runInit(rest);
      return;
    }
    case "install": {
      const { run: runInstall } = await import("./cli/install.ts");
      await runInstall(rest);
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

main().catch((err) => {
  console.error(`fulcrum: fatal: ${(err as Error).message}`);
  process.exit(1);
});
