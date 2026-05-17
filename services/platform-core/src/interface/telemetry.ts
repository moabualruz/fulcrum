export type { RecordTuiRenderTelemetryInput } from "@platform-core/application/telemetry/commands.ts";

type TelemetryCommands = typeof import("@platform-core/application/telemetry/commands.ts");
export type TelemetryEntityManager = Parameters<TelemetryCommands["recordTuiRenderTelemetry"]>[0];

export async function recordTuiRenderTelemetry(
  em: TelemetryEntityManager,
  input: import("@platform-core/application/telemetry/commands.ts").RecordTuiRenderTelemetryInput,
): Promise<void> {
  const telemetry = await import("@platform-core/application/telemetry/commands.ts");
  return telemetry.recordTuiRenderTelemetry(em, input);
}
