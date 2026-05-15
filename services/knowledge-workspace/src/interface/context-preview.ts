export type {
  ArtifactSlice,
  ContextBundle,
  ContextPreview,
  ContextSourceRef,
  DocSlice,
  MemorySlice,
  ProjectOption,
  RunSlice,
  TaskOption,
} from "@knowledge-workspace/application/context/queries.ts";

type LoadContextBundle = typeof import("@knowledge-workspace/application/context/queries.ts").loadContextBundle;
type LoadContextPreviewOptions = typeof import("@knowledge-workspace/application/context/queries.ts").loadContextPreviewOptions;
type PreviewContext = typeof import("@knowledge-workspace/application/context/queries.ts").previewContext;

export async function loadContextBundle(
  ...args: Parameters<LoadContextBundle>
): Promise<Awaited<ReturnType<LoadContextBundle>>> {
  const queries = await import("@knowledge-workspace/application/context/queries.ts");
  return queries.loadContextBundle(...args);
}

export async function loadContextPreviewOptions(
  ...args: Parameters<LoadContextPreviewOptions>
): Promise<Awaited<ReturnType<LoadContextPreviewOptions>>> {
  const queries = await import("@knowledge-workspace/application/context/queries.ts");
  return queries.loadContextPreviewOptions(...args);
}

export async function previewContext(
  ...args: Parameters<PreviewContext>
): Promise<Awaited<ReturnType<PreviewContext>>> {
  const queries = await import("@knowledge-workspace/application/context/queries.ts");
  return queries.previewContext(...args);
}
