import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { RunEventSchema, type RunEvent } from "@fulcrum/shared";

export function appendEventJsonl(filePath: string, event: RunEvent): void {
  const parsed = RunEventSchema.parse(event);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(parsed)}\n`, { encoding: "utf8" });
}
