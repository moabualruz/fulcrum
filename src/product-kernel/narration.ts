import type { ProductDb } from "./db/types.ts";
import { eventDispatcher } from "./event-dispatcher.ts";
import { getArtifact, updateArtifactMetadata } from "./artifacts.ts";

const NARRATION_PROMPT_TEMPLATE =
  "Describe this file in 1-2 sentences for a developer reading an audit log. File: <filename>. Content: <first2000chars>";

const SIDECAR_TIMEOUT_MS = 5_000;
const CONTENT_LIMIT = 2_000;

export interface SidecarClient {
  infer(prompt: string, timeoutMs: number): Promise<string>;
}

/** Check whether report-llm-narration feature flag is enabled. */
export function isNarrationEnabled(): boolean {
  const features = process.env.FULCRUM_FEATURES ?? "";
  return features.split(",").some((f) => f.trim() === "report-llm-narration");
}

/** Build the narration prompt from filename and content. */
export function buildNarrationPrompt(filename: string, content: string): string {
  const truncated = content.slice(0, CONTENT_LIMIT);
  return NARRATION_PROMPT_TEMPLATE
    .replace("<filename>", filename)
    .replace("<first2000chars>", truncated);
}

export interface NarrateArtifactInput {
  artifactId: string;
  orgId: string;
  projectId?: string | null;
}

/**
 * artifact.narrate job handler.
 * When flag ON + sidecar available: call sidecar, write narration to metadata_json.
 * When flag OFF: no-op, no sidecar calls.
 * When sidecar times out (>5s): graceful skip, emit event, no failure.
 */
export async function narrateArtifact(
  db: ProductDb,
  input: NarrateArtifactInput,
  sidecar: SidecarClient,
): Promise<{ narrated: boolean; skipped?: string }> {
  if (!isNarrationEnabled()) {
    return { narrated: false, skipped: "flag-off" };
  }

  const artifact = await getArtifact(db, input.artifactId);
  if (!artifact) {
    return { narrated: false, skipped: "artifact-not-found" };
  }

  const filename = artifact.title;
  // Use body_path content if available; for now we use title as proxy.
  // In production, read file content from body_path. For this implementation,
  // content is passed via metadata_json.content or empty string.
  const content =
    (typeof artifact.metadata_json?.content === "string"
      ? artifact.metadata_json.content
      : "") as string;

  const prompt = buildNarrationPrompt(filename, content);

  try {
    const narration = await sidecar.infer(prompt, SIDECAR_TIMEOUT_MS);
    await updateArtifactMetadata(db, input.artifactId, { narration });
    return { narrated: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      message.includes("timeout") || message.includes("TIMEOUT") || message.includes("timed out");

    await eventDispatcher.dispatch(db, {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      actor: "system",
      subjectKind: "artifact",
      subjectId: input.artifactId,
      verb: "artifact.narration.skipped",
      payload: { reason: isTimeout ? "sidecar-timeout" : "sidecar-error", message },
    });

    // Graceful skip — job succeeds, no narration written.
    return { narrated: false, skipped: isTimeout ? "sidecar-timeout" : "sidecar-error" };
  }
}
