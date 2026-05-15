import type { EntityManager } from "@mikro-orm/postgresql";
import { Node, Schema } from "@tiptap/pm/model";
import { Transform, Step } from "@tiptap/pm/transform";

import { DocVersion } from "@platform-core/infrastructure/application-database/entities/docs/DocVersion.ts";
import { AppInvariantError, AppNotFoundError } from "@platform-core/domain/errors.ts";

export interface ReconstructDocVersionInput {
  orgId: string;
  docId: string;
  versionNum: number;
}

export interface ReconstructedDocVersion {
  version: DocVersion;
  contentJson: Record<string, unknown>;
  bodyMd: string;
}

type StoredDelta = {
  ops?: Array<{ path?: string[]; value?: unknown }>;
};

function jsonClone(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function applyDelta(
  base: Record<string, unknown>,
  delta: Record<string, unknown> | null,
  schema: Schema,
): Record<string, unknown> {
  if (!delta) {
    throw new AppInvariantError("Unsupported document version delta.");
  }
  const ops = (delta as StoredDelta | null)?.ops;
  const first = ops?.[0];
  // Legacy full-snapshot op
  if (first && Array.isArray(first.path) && first.path.length === 0 && first.value && typeof first.value === "object") {
    return jsonClone(first.value as Record<string, unknown>);
  }
  // ProseMirror Step JSON array
  const steps = (delta as { steps?: unknown[] }).steps;
  if (Array.isArray(steps) && steps.length > 0) {
    const doc = Node.fromJSON(schema, base);
    const tr = new Transform(doc);
    for (const stepJson of steps) {
      const step = Step.fromJSON(schema, stepJson as Record<string, unknown>);
      tr.step(step);
    }
    return tr.doc.toJSON() as Record<string, unknown>;
  }
  throw new AppInvariantError("Unsupported document version delta.");
}

/** Default minimal schema for server-side step replay when no custom schema is provided. */
function makeDefaultSchema(): Schema {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { content: "inline*", group: "block" },
      text: { group: "inline" },
    },
    marks: {},
  });
}

export async function reconstructDocVersion(
  em: EntityManager,
  input: ReconstructDocVersionInput,
  schema?: Schema,
): Promise<ReconstructedDocVersion> {
  const pmSchema = schema ?? makeDefaultSchema();

  const target = await em.findOne(DocVersion, {
    org: input.orgId,
    doc: input.docId,
    versionNum: input.versionNum,
  } as never);
  if (!target) {
    throw new AppNotFoundError("Document version not found.");
  }

  const snapshot = await em.findOne(DocVersion, {
    org: input.orgId,
    doc: input.docId,
    versionNum: { $lte: input.versionNum },
    snapshot: { $ne: null },
  } as never, {
    orderBy: { versionNum: "DESC" },
  });
  if (!snapshot?.snapshot) {
    throw new AppInvariantError("No snapshot found for document version.");
  }

  let contentJson = jsonClone(snapshot.snapshot);
  const deltas = await em.find(DocVersion, {
    org: input.orgId,
    doc: input.docId,
    versionNum: { $gt: snapshot.versionNum, $lte: input.versionNum },
  } as never, {
    orderBy: { versionNum: "ASC" },
  });
  for (const version of deltas) {
    contentJson = version.snapshot ? jsonClone(version.snapshot) : applyDelta(contentJson, version.delta, pmSchema);
  }

  return {
    version: target,
    contentJson,
    bodyMd: target.bodyMdSnapshot ?? "",
  };
}

export function diffDocVersionsHtml(from: Record<string, unknown>, to: Record<string, unknown>): string {
  const before = JSON.stringify(from, null, 2);
  const after = JSON.stringify(to, null, 2);
  return [
    '<div class="doc-version-diff">',
    `<del>${escapeHtml(before)}</del>`,
    `<ins>${escapeHtml(after)}</ins>`,
    "</div>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
