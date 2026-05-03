export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: readonly string[], booleanFlags: ReadonlySet<string>): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  let stopFlags = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (stopFlags) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      stopFlags = true;
      continue;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
        continue;
      }
      if (booleanFlags.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[token] = next;
        i += 1;
        continue;
      }
      flags[token] = true;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

export function flagString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[`--${name}`];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[`--${name}`] !== undefined;
}

export function flagNumber(parsed: ParsedArgs, name: string): number | undefined {
  const raw = flagString(parsed, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

export function flagIso(parsed: ParsedArgs, name: string): string | undefined {
  const raw = flagString(parsed, name);
  if (raw === undefined) return undefined;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) throw new Error(`--${name} must be an ISO date`);
  return new Date(time).toISOString();
}

export function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = flagString(parsed, name);
  if (value === undefined || value.length === 0) throw new Error(`missing --${name}`);
  return value;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
