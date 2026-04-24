import { createHash } from "node:crypto";

export interface McpCallLogEntry {
  toolName: string;
  caller?: string;
  runId?: string;
  parameterHash: string;
  redactedParameters: unknown;
  resultSummary: string;
  timestamp: string;
  redactionStatus: "redacted" | "not_applicable" | "needs_review";
  policyDecisionIds: string[];
}

export class InMemoryMcpCallLog {
  private readonly entries: McpCallLogEntry[] = [];

  record(entry: McpCallLogEntry): McpCallLogEntry {
    this.entries.push(entry);
    return entry;
  }

  list(): McpCallLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export const defaultMcpCallLog = new InMemoryMcpCallLog();

export function summarizeMcpCall(input: {
  toolName: string;
  args: unknown;
  response: { status: string; policyDecisionIds?: string[]; redactionStatus?: string };
}): McpCallLogEntry {
  const redactedParameters = redactParameters(input.args);
  return {
    toolName: input.toolName,
    caller: readString(input.args, "caller") ?? readString(input.args, "requester"),
    runId: readString(input.args, "runId"),
    parameterHash: createHash("sha256").update(JSON.stringify(redactedParameters)).digest("hex"),
    redactedParameters,
    resultSummary: input.response.status,
    timestamp: new Date().toISOString(),
    redactionStatus:
      input.response.redactionStatus === "redacted" ||
      input.response.redactionStatus === "needs_review"
        ? input.response.redactionStatus
        : "not_applicable",
    policyDecisionIds: input.response.policyDecisionIds ?? []
  };
}

function redactParameters(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactParameters);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /token|secret|password|credential/i.test(key) ? "[REDACTED]" : redactParameters(entry)
    ])
  );
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}
