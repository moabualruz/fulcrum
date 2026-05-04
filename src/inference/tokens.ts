import { InjectionToken } from "@needle-di/core";

import type { InferenceClient } from "./client.ts";

export const INFERENCE_CLIENT_TOKEN = new InjectionToken<InferenceClient>(
  "InferenceClient",
);
