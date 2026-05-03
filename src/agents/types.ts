import { z } from "zod";

export const SandcastleProviderSchema = z.enum([
  "noSandbox",
  "docker",
  "podman",
  "vercel",
  "daytona",
  "modal",
  "e2b",
]);

export const AgentProfileSchema = z.object({
  name: z.string().min(1),
  cliPath: z.string().min(1),
  defaultFlags: z.array(z.string()),
  skillFolder: z.string().min(1),
  authEnvVars: z.array(z.string().min(1)),
  sandcastleProvider: SandcastleProviderSchema,
  maxIterations: z.number().int().positive(),
  defaultTimeout: z.number().int().positive(),
});

export type SandcastleProvider = z.infer<typeof SandcastleProviderSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
