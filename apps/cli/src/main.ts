import { Command } from "commander";

const program = new Command();

program
  .name("fulcrum")
  .description("Local-first CLI Agent OS")
  .version("0.1.0")
  .option("--json", "emit machine-readable JSON")
  .option("--config <path>", "use explicit Fulcrum config file")
  .option("--local-only", "deny remote actions unless policy allows");

program
  .command("doctor")
  .description("Report local capability and privacy health")
  .option("--no-network", "avoid network checks")
  .action((options) => {
    const payload = {
      schemaVersion: "1.0",
      status: "ok",
      data: {
        summary: "scaffold",
        networkDefault: options.noNetwork ? "local-only" : "operator-configured"
      }
    };
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum doctor scaffold");
  });

program.parse();
