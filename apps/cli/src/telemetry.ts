export { runTelemetry } from "./commands/cross-cutting-platform.ts";

export const TELEMETRY_COMMANDS = ["status", "opt-in", "opt-out", "purge"] as const;
