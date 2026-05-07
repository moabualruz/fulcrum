import type { Container } from "@needle-di/core";

import { createApplicationLocalCaller } from "../application/cli-tui/caller-context.ts";

export async function createLocalCaller(options: {
  container?: Container | null;
  requireSession?: boolean;
} = {}) {
  return createApplicationLocalCaller(options);
}
