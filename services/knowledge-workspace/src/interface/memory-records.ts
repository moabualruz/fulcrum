export type {
  CreateMemoryInput,
  ListMemoriesInput,
  MemoryRow,
  MemoryScope,
  UpdateMemoryInput,
} from "@knowledge-workspace/application/memory/web-queries.ts";

export const MEMORY_SCOPES = ["project", "global", "task", "user"] as const;

type CreateMemoryAction = typeof import("@knowledge-workspace/application/memory/web-queries.ts").createMemoryAction;
type DeleteMemoryAction = typeof import("@knowledge-workspace/application/memory/web-queries.ts").deleteMemoryAction;
type GetMemory = typeof import("@knowledge-workspace/application/memory/web-queries.ts").getMemory;
type ListMemories = typeof import("@knowledge-workspace/application/memory/web-queries.ts").listMemories;
type UpdateMemoryAction = typeof import("@knowledge-workspace/application/memory/web-queries.ts").updateMemoryAction;

export async function createMemoryAction(
  ...args: Parameters<CreateMemoryAction>
): Promise<Awaited<ReturnType<CreateMemoryAction>>> {
  const queries = await import("@knowledge-workspace/application/memory/web-queries.ts");
  return queries.createMemoryAction(...args);
}

export async function updateMemoryAction(
  ...args: Parameters<UpdateMemoryAction>
): Promise<Awaited<ReturnType<UpdateMemoryAction>>> {
  const queries = await import("@knowledge-workspace/application/memory/web-queries.ts");
  return queries.updateMemoryAction(...args);
}

export async function deleteMemoryAction(
  ...args: Parameters<DeleteMemoryAction>
): Promise<Awaited<ReturnType<DeleteMemoryAction>>> {
  const queries = await import("@knowledge-workspace/application/memory/web-queries.ts");
  return queries.deleteMemoryAction(...args);
}

export async function getMemory(
  ...args: Parameters<GetMemory>
): Promise<Awaited<ReturnType<GetMemory>>> {
  const queries = await import("@knowledge-workspace/application/memory/web-queries.ts");
  return queries.getMemory(...args);
}

export async function listMemories(
  ...args: Parameters<ListMemories>
): Promise<Awaited<ReturnType<ListMemories>>> {
  const queries = await import("@knowledge-workspace/application/memory/web-queries.ts");
  return queries.listMemories(...args);
}
