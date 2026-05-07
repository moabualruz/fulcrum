import { readFile, writeFile } from "node:fs/promises";
import { verifyBackupArchive } from "@/backup/runner.ts";
import { dirForLocale, normalizeLocale } from "@/i18n/index.ts";
import type { NativeKeyringAdapter } from "@/secrets/keyring.ts";
import { productionAdapterFactory, type NativeAdapterLoader } from "@/secrets/keyring-platform.ts";

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
  if (sub === "list") {
    const rows = await opts.caller?.theme.listThemes();
    const compact = rows.map((row: { key: string; value: string; defaultValue: string }) => ({
      key: row.key,
      value: row.value,
      defaultValue: row.defaultValue,
    }));
    jsonOrText(print, has(argv, "--json"), compact, compact.map((row: { key: string; value: string }) => `${row.key}=${row.value}`).join("\n"));
    return;
  }

  if (sub === "set") {
    const key = option(argv, "--key");
    const value = option(argv, "--value");
    if (!key) return fail(opts, "fulcrum theme set: missing required option --key", 2);
    if (!value) return fail(opts, "fulcrum theme set: missing required option --value", 2);
    const result = await opts.caller?.theme.setTheme({ key, value });
    jsonOrText(print, has(argv, "--json"), result, `${result.key}=${result.value}`);
    return;
  }

  fail(opts, `fulcrum theme: unknown command '${sub}'`, 2);
}

export async function runI18n(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;

  if (sub === "list") {
    jsonOrText(print, has(argv, "--json"), {
      locales: ["en", "fr", "ar"],
      defaultLocale: "en",
    }, "en\nfr\nar");
    return;
  }

  if (sub === "set") {
    const locale = normalizeLocale(option(argv, "--locale"));
    const payload = { locale, dir: dirForLocale(locale, true) };
    jsonOrText(print, has(argv, "--json"), payload, `${payload.locale} ${payload.dir}`);
    return;
  }

  fail(opts, `fulcrum i18n: unknown command '${sub}'`, 2);
}

export async function runSecrets(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  const args = positionals(argv.slice(1));
  const name = option(argv, "--name") ?? args[0];
  if (!name) return fail(opts, `fulcrum secrets ${sub}: missing required argument <name>`, 2);

  if (sub === "set") {
    const raw = option(argv, "--value") ??
      await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
    const result = await opts.caller?.credentials.set({ name, value: raw.replace(/\r?\n$/, "") });
    print(JSON.stringify(result));
    return;
  }

  if (sub === "rotate") {
    const raw = option(argv, "--value") ??
      await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
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
  if (sub === "list") {
    const sinceValue = option(argv, "--since");
    const rows = await opts.caller?.errorLogs.list({
      since: sinceValue ? new Date(`${sinceValue}T00:00:00.000Z`) : undefined,
    });
    jsonOrText(print, has(argv, "--json"), rows, rows.map((row: { id: string; errorMessage: string }) => `${row.id} ${row.errorMessage}`).join("\n"));
    return;
  }

  if (sub === "get") {
    const id = positionals(argv.slice(1))[0];
    if (!id) return fail(opts, "fulcrum errors get: missing required argument <id>", 2);
    const row = await opts.caller?.errorLogs.get({ id });
    jsonOrText(print, has(argv, "--json"), row, `${row.id} ${row.errorMessage}`);
    return;
  }

  if (sub === "purge") {
    const result = await opts.caller?.errorLogs.clear({});
    jsonOrText(print, has(argv, "--json"), result, `deleted=${result.deleted}`);
    return;
  }

  return fail(opts, `fulcrum errors: unknown command '${sub}'`, 2);
}

export async function runBackup(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print, printErr } = io(opts);
  const [sub] = argv;

  if (sub === "create") {
    const result = await opts.caller?.backup.create();
    jsonOrText(print, has(argv, "--json"), result, `Backup created ${result.path ?? ""}`.trim());
    return;
  }

  if (sub === "restore") {
    const dump = option(argv, "--dump");
    if (!dump) return fail(opts, "fulcrum backup restore: missing required option --dump", 2);
    const result = await opts.caller?.backup.restore({ dump, dryRun: has(argv, "--dry-run") });
    jsonOrText(print, has(argv, "--json"), result, `${result.collisions?.length ?? 0} collisions`);
    return;
  }

  if (sub === "verify") {
    const path = option(argv, "--path");
    if (!path) return fail(opts, "fulcrum backup verify: missing required option --path", 2);
    const result = opts.caller?.backup.verify
      ? await opts.caller.backup.verify({ path })
      : { path, ...await verifyBackupArchive(path) };
    jsonOrText(print, has(argv, "--json"), result, result.ok ? "Backup verified" : "Backup verification failed");
    return;
  }

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
  if (sub === "status") {
    const result = await opts.caller?.telemetry.status({});
    jsonOrText(print, has(argv, "--json"), result, `opted_in=${result.opted_in} row_count=${result.row_count}`);
    return;
  }

  if (sub === "opt-in") {
    const result = await opts.caller?.telemetry.optIn({});
    jsonOrText(print, has(argv, "--json"), result, "opted in");
    return;
  }

  if (sub === "opt-out") {
    const result = await opts.caller?.telemetry.optOut({});
    jsonOrText(print, has(argv, "--json"), result, "opted out");
    return;
  }

  if (sub === "purge") {
    const result = await opts.caller?.telemetry.purge({});
    jsonOrText(print, has(argv, "--json"), result, `deleted=${result.deleted}`);
    return;
  }

  fail(opts, `fulcrum telemetry: unknown command '${sub}'`, 2);
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

  const dataExport = opts.caller?.dataExport ?? opts.caller?.jsonImportExport;
  const result = await dataExport.create({
    pretty: true,
    outputPath: output,
    entity: option(argv, "--entity"),
    format,
  });
  await writeFile(output, result.json);
  jsonOrText(io(opts).print, has(argv, "--json"), {
    path: output,
    entityCounts: result.entityCounts,
    format,
  }, `Export written to ${output}`);
}

export async function runDataImport(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;

  if (sub === "preflight") {
    const path = option(argv, "--path");
    if (!path) return fail(opts, "fulcrum data import preflight: missing required option --path", 2);
    const result = await opts.caller?.dataImport.preflight({ path });
    jsonOrText(print, has(argv, "--json"), result, `${Object.keys(result.counts ?? {}).length} entity kinds`);
    return;
  }

  if (sub === "run") {
    const importId = option(argv, "--import-id");
    if (!importId) return fail(opts, "fulcrum data import run: missing required option --import-id", 2);
    const result = await opts.caller?.dataImport.run({
      importId,
      dryRun: has(argv, "--dry-run"),
      onConflict: option(argv, "--on-conflict"),
    });
    jsonOrText(print, has(argv, "--json"), result, `imported=${result.imported} updated=${result.updated}`);
    return;
  }

  fail(opts, `fulcrum data import: unknown command '${sub}'`, 2);
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
