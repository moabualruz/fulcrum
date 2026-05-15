import { InferenceClient } from "@platform-core/application/inference/client.ts";
import type { DocType } from "@platform-core/infrastructure/application-database/entities/docs/enums.ts";
import type { GenerateResult } from "@platform-core/application/inference/protocol.ts";

const FLAG = "report-llm-narration";
const ELIGIBLE_DOC_TYPES = new Set<DocType>(["adr", "postmortem", "rfc"]);
const SUMMARY_MARKER = "> [AI Summary]";

export type NarrationBackend = "embedded" | "ollama" | "lm-studio" | "openai-compatible";

export interface NarrationFeatureSpec {
  backend: NarrationBackend;
}

export interface NarrationClient {
  generate(prompt: string, options?: { backend?: string; maxTokens?: number; temperature?: number }): Promise<GenerateResult>;
}

export interface ApplyNarrationInput {
  docType: DocType;
  bodyMd: string;
  contentJson: Record<string, unknown>;
}

export interface ApplyNarrationResult {
  changed: boolean;
  bodyMd: string;
  contentJson: Record<string, unknown>;
}

let configuredClient: NarrationClient | null = null;

export function configureDocNarrator(config: { client: NarrationClient | null }): void {
  configuredClient = config.client;
}

export function parseNarrationFeature(features = process.env["FULCRUM_FEATURES"] ?? ""): NarrationFeatureSpec | null {
  const match = features
    .split(",")
    .map((feature) => feature.trim())
    .find((feature) => feature === FLAG || feature.startsWith(`${FLAG}:`));
  if (!match) return null;

  const backend = match.split(":")[1] || "embedded";
  if (backend === "ollama" || backend === "lm-studio" || backend === "openai-compatible") {
    return { backend };
  }
  return { backend: "embedded" };
}

export function stripNarrationFromBody(bodyMd: string): string {
  if (!bodyMd.startsWith(SUMMARY_MARKER)) return bodyMd;
  const delimiter = "\n\n---\n\n";
  const delimiterIndex = bodyMd.indexOf(delimiter);
  if (delimiterIndex === -1) return bodyMd;
  return bodyMd.slice(delimiterIndex + delimiter.length);
}

export function prependNarrationToBody(summary: string, bodyMd: string): string {
  const cleanSummary = normalizeSummary(summary);
  const quoted = cleanSummary
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  return `${SUMMARY_MARKER}\n>\n${quoted}\n\n---\n\n${stripNarrationFromBody(bodyMd)}`;
}

export function prependNarrationToContent(summary: string, contentJson: Record<string, unknown>): Record<string, unknown> {
  const content = Array.isArray(contentJson.content) ? contentJson.content : [];
  const withoutExisting = content.filter((node) => !isNarrationNode(node));
  return {
    ...contentJson,
    type: contentJson.type ?? "doc",
    content: [
      {
        type: "narration-block",
        attrs: {
          readonly: true,
          text: normalizeSummary(summary),
        },
      },
      ...withoutExisting,
    ],
  };
}

export async function applyNarrationToDoc(input: ApplyNarrationInput): Promise<ApplyNarrationResult> {
  const spec = parseNarrationFeature();
  if (!spec || !ELIGIBLE_DOC_TYPES.has(input.docType)) {
    return { changed: false, bodyMd: input.bodyMd, contentJson: input.contentJson };
  }

  const client = configuredClient ?? new InferenceClient();
  try {
    const bodyWithoutExisting = stripNarrationFromBody(input.bodyMd);
    const result = await client.generate(buildNarrationPrompt(bodyWithoutExisting), {
      backend: spec.backend,
      maxTokens: 500,
      temperature: 0.2,
    });
    const summary = normalizeSummary(result.text);
    return {
      changed: true,
      bodyMd: prependNarrationToBody(summary, bodyWithoutExisting),
      contentJson: prependNarrationToContent(summary, input.contentJson),
    };
  } catch (error) {
    console.warn("docs.llm-narrator: summary generation failed; saving without narration", error);
    return { changed: false, bodyMd: input.bodyMd, contentJson: input.contentJson };
  }
}

function buildNarrationPrompt(bodyMd: string): string {
  return [
    "System: Generate a 2-paragraph executive summary of the following document.",
    "Be concise. Do not add new information.",
    "",
    "Document:",
    bodyMd,
  ].join("\n");
}

function normalizeSummary(summary: string): string {
  return summary
    .trim()
    .split(/\n{3,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n\n");
}

function isNarrationNode(node: unknown): boolean {
  return typeof node === "object" &&
    node !== null &&
    "type" in node &&
    (node as { type?: unknown }).type === "narration-block";
}
