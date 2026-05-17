import type { InferenceClient } from "./client.ts";

export const INFERENCE_CLIENT_TOKEN = "InferenceClient" as const;
export type InferenceClientToken = typeof INFERENCE_CLIENT_TOKEN;
// Type helper so consumers can still use typed injection
export type { InferenceClient };
