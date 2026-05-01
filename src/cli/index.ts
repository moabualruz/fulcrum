#!/usr/bin/env bun

const HELP = `fulcrum

Usage:
  fulcrum init
  fulcrum db <migrate|status|history> [options]
`;

export async function run(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "init": {
      const { run: runInit } = await import("./commands/init.ts");
      await runInit(rest);
      return;
    }
    case "db": {
      const { run: runDb } = await import("./commands/db.ts");
      await runDb(rest);
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
