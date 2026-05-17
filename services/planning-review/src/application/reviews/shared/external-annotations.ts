export type StorableAnnotation = { id: string; source?: string };

export type ExternalAnnotationEvent<T = unknown> =
  | { type: "snapshot"; annotations: T[] }
  | { type: "add"; annotations: T[] }
  | { type: "remove"; ids: string[] }
  | { type: "clear"; source?: string }
  | { type: "update"; id: string; annotation: T };

export const HEARTBEAT_COMMENT = ":\n\n";
export const HEARTBEAT_INTERVAL_MS = 30_000;

export function serializeSSEEvent<T>(event: ExternalAnnotationEvent<T>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export interface ParseError {
  error: string;
}

function unwrapBody(body: unknown): Record<string, unknown>[] | ParseError {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  if (Array.isArray(obj.annotations)) {
    if (obj.annotations.length === 0) {
      return { error: "annotations array must not be empty" };
    }

    const items: Record<string, unknown>[] = [];
    for (const [index, item] of obj.annotations.entries()) {
      if (!item || typeof item !== "object") {
        return { error: `annotations[${index}] must be an object` };
      }
      items.push(item as Record<string, unknown>);
    }
    return items;
  }

  if (typeof obj.source === "string") {
    return [obj];
  }

  return { error: 'Missing required "source" field or "annotations" array' };
}

function requireString(obj: Record<string, unknown>, field: string, index: number): string | ParseError {
  const value = obj[field];
  if (typeof value !== "string" || value.length === 0) {
    return { error: `annotations[${index}] missing required "${field}" field` };
  }
  return value;
}

export interface PlanAnnotation extends StorableAnnotation {
  blockId: string;
  startOffset: number;
  endOffset: number;
  type: string;
  text?: string;
  originalText: string;
  createdA: number;
  author?: string;
}

const VALID_PLAN_TYPES = ["DELETION", "COMMENT", "GLOBAL_COMMENT"];

export function transformPlanInput(body: unknown): { annotations: PlanAnnotation[] } | ParseError {
  const items = unwrapBody(body);
  if ("error" in items) return items;

  const annotations: PlanAnnotation[] = [];
  for (const [index, obj] of items.entries()) {
    const source = requireString(obj, "source", index);
    if (typeof source !== "string") return source;

    if (typeof obj.text !== "string" || obj.text.length === 0) {
      return { error: `annotations[${index}] missing required "text" field` };
    }

    const type = typeof obj.type === "string" ? obj.type : "GLOBAL_COMMENT";
    if (!VALID_PLAN_TYPES.includes(type)) {
      return {
        error: `annotations[${index}] invalid type "${type}". Must be one of: ${VALID_PLAN_TYPES.join(", ")}`,
      };
    }

    if (type === "DELETION" && (typeof obj.originalText !== "string" || obj.originalText.length === 0)) {
      return { error: `annotations[${index}] DELETION type requires non-empty "originalText" field` };
    }

    if (type === "COMMENT" && (typeof obj.originalText !== "string" || obj.originalText.length === 0)) {
      return {
        error: `annotations[${index}] COMMENT requires non-empty "originalText" field. Use GLOBAL_COMMENT for sidebar-only feedback.`,
      };
    }

    annotations.push({
      id: crypto.randomUUID(),
      blockId: "external",
      startOffset: 0,
      endOffset: 0,
      type,
      text: obj.text,
      originalText: typeof obj.originalText === "string" ? obj.originalText : "",
      createdA: Date.now(),
      ...(typeof obj.author === "string" ? { author: obj.author } : {}),
      source,
    });
  }

  return { annotations };
}

export interface ReviewAnnotation extends StorableAnnotation {
  type: string;
  scope?: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: string;
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  createdAt: number;
  author?: string;
  severity?: string;
  reasoning?: string;
}

const VALID_REVIEW_TYPES = ["comment", "suggestion", "concern"];
const VALID_SIDES = ["old", "new"];
const VALID_SCOPES = ["line", "file"];

export function transformReviewInput(body: unknown): { annotations: ReviewAnnotation[] } | ParseError {
  const items = unwrapBody(body);
  if ("error" in items) return items;

  const annotations: ReviewAnnotation[] = [];
  for (const [index, obj] of items.entries()) {
    const source = requireString(obj, "source", index);
    if (typeof source !== "string") return source;

    const filePath = requireString(obj, "filePath", index);
    if (typeof filePath !== "string") return filePath;

    if (typeof obj.lineStart !== "number") {
      return { error: `annotations[${index}] missing required "lineStart" field` };
    }
    if (typeof obj.lineEnd !== "number") {
      return { error: `annotations[${index}] missing required "lineEnd" field` };
    }

    const side = typeof obj.side === "string" ? obj.side : "new";
    if (!VALID_SIDES.includes(side)) {
      return {
        error: `annotations[${index}] invalid side "${side}". Must be one of: ${VALID_SIDES.join(", ")}`,
      };
    }

    const type = typeof obj.type === "string" ? obj.type : "comment";
    if (!VALID_REVIEW_TYPES.includes(type)) {
      return {
        error: `annotations[${index}] invalid type "${type}". Must be one of: ${VALID_REVIEW_TYPES.join(", ")}`,
      };
    }

    const scope = typeof obj.scope === "string" ? obj.scope : "line";
    if (!VALID_SCOPES.includes(scope)) {
      return {
        error: `annotations[${index}] invalid scope "${scope}". Must be one of: ${VALID_SCOPES.join(", ")}`,
      };
    }

    if (typeof obj.text !== "string" && typeof obj.suggestedCode !== "string") {
      return {
        error: `annotations[${index}] must have at least one of: text, suggestedCode`,
      };
    }

    annotations.push({
      id: crypto.randomUUID(),
      type,
      scope,
      filePath,
      lineStart: obj.lineStart,
      lineEnd: obj.lineEnd,
      side,
      ...(typeof obj.text === "string" ? { text: obj.text } : {}),
      ...(typeof obj.suggestedCode === "string" ? { suggestedCode: obj.suggestedCode } : {}),
      ...(typeof obj.originalCode === "string" ? { originalCode: obj.originalCode } : {}),
      createdAt: Date.now(),
      ...(typeof obj.author === "string" ? { author: obj.author } : {}),
      source,
      ...(typeof obj.severity === "string" ? { severity: obj.severity } : {}),
      ...(typeof obj.reasoning === "string" ? { reasoning: obj.reasoning } : {}),
    });
  }

  return { annotations };
}

type MutationListener<T> = (event: ExternalAnnotationEvent<T>) => void;

export interface AnnotationStore<T extends StorableAnnotation> {
  add(items: T[]): T[];
  remove(id: string): boolean;
  clearBySource(source: string): number;
  update(id: string, fields: Partial<T>): T | null;
  clearAll(): number;
  getAll(): T[];
  readonly version: number;
  onMutation(listener: MutationListener<T>): () => void;
}

export function createAnnotationStore<T extends StorableAnnotation>(): AnnotationStore<T> {
  const annotations: T[] = [];
  const listeners = new Set<MutationListener<T>>();
  let version = 0;

  function emit(event: ExternalAnnotationEvent<T>): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break annotation mutation.
      }
    }
  }

  return {
    add(items) {
      if (items.length > 0) {
        for (const item of items) {
          annotations.push(item);
        }
        version++;
        emit({ type: "add", annotations: items });
      }
      return items;
    },

    remove(id) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index === -1) return false;
      annotations.splice(index, 1);
      version++;
      emit({ type: "remove", ids: [id] });
      return true;
    },

    clearBySource(source) {
      const before = annotations.length;
      for (let index = annotations.length - 1; index >= 0; index--) {
        if (annotations[index]?.source === source) {
          annotations.splice(index, 1);
        }
      }

      const removed = before - annotations.length;
      if (removed > 0) {
        version++;
        emit({ type: "clear", source });
      }
      return removed;
    },

    update(id, fields) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index === -1) return null;
      const current = annotations[index];
      if (!current) return null;

      const merged = { ...current, ...fields, id } as T;
      annotations[index] = merged;
      version++;
      emit({ type: "update", id, annotation: merged });
      return merged;
    },

    clearAll() {
      const count = annotations.length;
      if (count > 0) {
        annotations.length = 0;
        version++;
        emit({ type: "clear" });
      }
      return count;
    },

    getAll() {
      return [...annotations];
    },

    get version() {
      return version;
    },

    onMutation(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
