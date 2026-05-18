import {
  createDoctorApiCallerFromEnv,
  type DoctorApiEnvironment,
} from "@platform-core/interface/http/doctor-api-client.ts";
import { formatApiError } from "../api-errors.ts";

type DoctorCaller = {
  doctor: {
    run(input?: Record<string, never>): Promise<unknown>;
    subsystems(input?: Record<string, never>): Promise<unknown>;
  };
};

export interface DoctorRunOptions {
  caller?: DoctorCaller;
  env?: DoctorApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum doctor

Usage:
  fulcrum doctor [--json]
  fulcrum doctor subsystems [--json]
`;

export async function run(argv: readonly string[], opts: DoctorRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "run", ...rest] = argv;
  const command = verb.startsWith("-") ? "run" : verb;
  const commandArgs = verb.startsWith("-") ? argv : rest;

  try {
    switch (command) {
      case "run": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.doctor.run(), commandArgs, io.print);
      }
      case "subsystems": {
        const caller = await resolveCaller(opts);
        const result = await caller.doctor.subsystems();
        if (commandArgs.includes("--json")) {
          io.print(JSON.stringify(result));
          return;
        }
        printSubsystemsTable(result, io.print);
        return;
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum doctor: unknown command '${command}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum doctor ${command}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: DoctorRunOptions): Promise<DoctorCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createDoctorApiCallerFromEnv(opts.env, opts.fetch);
  if (apiCaller) return apiCaller as DoctorCaller;
  throw new Error("Doctor API caller is not configured");
}

function printOutput(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

interface SubsystemStatusRow {
  name: string;
  status: "healthy" | "degraded" | "broken";
  message: string;
  recoveryAction: string | null;
  checkedAt: string;
}

function statusIcon(status: SubsystemStatusRow["status"]): string {
  switch (status) {
    case "healthy": return "✓";
    case "degraded": return "⚠";
    case "broken": return "✗";
  }
}

function printSubsystemsTable(value: unknown, print: (line: string) => void): void {
  const rows = Array.isArray(value) ? value as SubsystemStatusRow[] : [];
  if (rows.length === 0) {
    print("No subsystems reported.");
    return;
  }
  const nameWidth = Math.max(...rows.map((row) => row.name.length), "subsystem".length);
  const header = `${"subsystem".padEnd(nameWidth)}  status  message`;
  print(header);
  print("-".repeat(header.length));
  for (const row of rows) {
    const icon = statusIcon(row.status);
    print(`${row.name.padEnd(nameWidth)}  ${icon} ${row.status.padEnd(8)}  ${row.message}`);
    if (row.recoveryAction) {
      print(`${" ".repeat(nameWidth)}  recover: ${row.recoveryAction}`);
    }
    print(`${" ".repeat(nameWidth)}  checked: ${row.checkedAt}`);
  }
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
