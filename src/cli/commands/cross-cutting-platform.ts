import { readFile, writeFile } from "node:fs/promises";
import type { NativeKeyringAdapter } from "../../secrets/keyring.ts";
import { productionAdapterFactory, type NativeAdapterLoader } from "../../secrets/keyring-platform.ts";

type Writer = (line: string) => void;

type CliOptions = {
  caller?: Record<string, any>;
  print?: Writer;
  printErr?: Writer;
  exit?: (code: number) => void;
  stdin?: () => Promise<string>;
  readInput?: (path: string) => Promise<string>;
  /** Injectable factory for init-keyring — for tests. */
  loaderFactory?: NativeAdapterLoader;
};

function io(opts: CliOptions) {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function has(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function option(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function positionals(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]!;
    if (item.startsWith("-")) {
      if (!["--json", "--dry-run", "--enabled", "--disabled", "--unmask"].includes(item)) i += 1;
      continue;
    }
    values.push(item);
  }
  return values;
}

function jsonOrText(print: Writer, jsonMode: boolean, value: unknown, text: string): void {
  print(jsonMode ? JSON.stringify(value) : text);
}

function fail(opts: CliOptions, message: string, code = 1): void {
  const { printErr, exit } = io(opts);
  printErr(message);
  exit(code);
}

export async function runTheme(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub !== "list") return fail(opts, `fulcrum theme: unknown command '${sub}'`, 2);
  const rows = await opts.caller?.theme.listThemes();
  const compact = rows.map((row: { key: string; value: string }) => ({ key: row.key, value: row.value }));
  jsonOrText(print, has(argv, "--json"), compact, compact.map((row: { key: string; value: string }) => `${row.key}=${row.value}`).join("\n"));
}

export async function runSecrets(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  const args = positionals(argv.slice(1));
  const name = args[0];
  if (!name) return fail(opts, `fulcrum secrets ${sub}: missing required argument <name>`, 2);

  if (sub === "set") {
    const raw = await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
    const result = await opts.caller?.credentials.set({ name, value: raw.replace(/\r?\n$/, "") });
    print(JSON.stringify(result));
    return;
  }

  if (sub === "rotate") {
    const raw = await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
    const result = await opts.caller?.credentials.rotate({ name, value: raw.replace(/\r?\n$/, "") });
    print(JSON.stringify(result));
    return;
  }

  if (sub === "get") {
    if (has(argv, "--unmask")) return fail(opts, "fulcrum secrets get: --unmask requires interactive confirmation", 1);
    const result = await opts.caller?.credentials.get({ name });
    print(JSON.stringify({
      name: result.name,
      masked_value: result.masked_value ?? "***",
      last_used_at: result.last_used_at ?? null,
    }));
    return;
  }

  fail(opts, `fulcrum secrets: unknown command '${sub}'`, 2);
}

export async function runErrors(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub !== "list") return fail(opts, `fulcrum errors: unknown command '${sub}'`, 2);
  const sinceValue = option(argv, "--since");
  const rows = await opts.caller?.errorLogs.list({
    since: sinceValue ? new Date(`${sinceValue}T00:00:00.000Z`) : undefined,
  });
  jsonOrText(print, has(argv, "--json"), rows, rows.map((row: { id: string; errorMessage: string }) => `${row.id} ${row.errorMessage}`).join("\n"));
}

export async function runBackup(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print, printErr } = io(opts);
  const output = option(argv, "--output");
  if (!output) return fail(opts, "fulcrum backup: missing required option --output", 2);
  const result = await opts.caller?.backup.create();
  const body = Buffer.from(result.dump, "base64").toString("utf8");
  await writeFile(output, body);
  printErr(`${Math.ceil(Buffer.byteLength(body) / 1024)} KB written`);
  jsonOrText(print, has(argv, "--json"), {
    manifest: { entity_counts: result.entityCounts },
    path: output,
  }, `Backup written to ${output}`);
}

export async function runRestore(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const input = option(argv, "--input");
  if (!input) return fail(opts, "fulcrum restore: missing required option --input", 2);
  const dump = opts.readInput ? await opts.readInput(input) : await readFile(input, "utf8");
  const result = await opts.caller?.backup.restore({ dump, dryRun: has(argv, "--dry-run") });
  const payload = {
    collisions: result.collisions ?? [],
    entity_counts: result.entity_counts ?? result.entityCounts ?? {},
  };
  jsonOrText(print, has(argv, "--json"), payload, `${payload.collisions.length} collisions`);
}

export async function runTelemetry(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub !== "status") return fail(opts, `fulcrum telemetry: unknown command '${sub}'`, 2);
  const result = await opts.caller?.telemetry.status({});
  jsonOrText(print, has(argv, "--json"), result, `opted_in=${result.opted_in} row_count=${result.row_count}`);
}

export async function runDataExport(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const format = option(argv, "--format") ?? "json";
  const output = option(argv, "--output");
  if (!output) return fail(opts, "fulcrum export: missing required option --output", 2);

  if (format === "csv") {
    const flags = await opts.caller?.flags.list();
    const enabled = flags.some((flag: { name: string; enabled: boolean }) =>
      flag.name === "import-csv/export-csv" && flag.enabled,
    );
    if (!enabled) return fail(opts, "Feature import-csv/export-csv not enabled", 1);
  }

  const result = await opts.caller?.jsonImportExport.create({
    pretty: true,
    outputPath: output,
    entity: option(argv, "--entity"),
    format,
  });
  await writeFile(output, result.json);
  io(opts).print(JSON.stringify({ path: output, entity_counts: result.entityCounts }));
}

/**
 * runSecretsInitKeyring — `fulcrum secrets init-keyring`
 *
 * Attempts to (re-)load the native OS keyring module. Prints diagnostic on
 * failure and exits with code 1. Never crashes the process on load error.
 *
 * Issue 21: recovery action after node-keytar install.
 */
export async function runSecretsInitKeyring(
  argv: readonly string[],
  opts: CliOptions = {},
): Promise<void> {
  const { print, printErr, exit } = io(opts);
  const loader = opts.loaderFactory ?? productionAdapterFactory;

  let adapter: NativeKeyringAdapter | null = null;
  try {
    adapter = await loader();
  } catch (e) {
    adapter = null;
    printErr(
      `Native keyring load error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (adapter) {
    print("Native keyring loaded successfully. OS keyring is active.");
    return;
  }

  printErr(
    "Native keyring could not be loaded. Install node-keytar or @napi-rs/keyring and re-run `fulcrum secrets init-keyring`.",
  );
  exit(1);
}
