<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface FileNode {
    id: string;
    path: string;
    kind: "file" | "directory";
    mime: string | null;
    size_bytes: number | null;
  }

  interface Props {
    node: FileNode;
    repoId: string;
    branch: string;
    depth?: number;
  }

  let { node, repoId, branch, depth = 0 }: Props = $props();

  let expanded = $state(false);
  let children = $state<FileNode[]>([]);
  let loading = $state(false);
  let loaded = $state(false);

  function fileName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? path;
  }

  async function toggle() {
    if (node.kind !== "directory") return;
    if (!loaded) {
      loading = true;
      try {
        const res = await fetch(
          `/api/repos/${repoId}/tree?branch=${encodeURIComponent(branch)}&parent=${encodeURIComponent(node.path)}`,
        );
        if (res.ok) {
          const data = await res.json();
          children = data.children ?? [];
        }
      } finally {
        loading = false;
        loaded = true;
      }
    }
    expanded = !expanded;
  }

  const fileHref = $derived(
    node.kind === "file"
      ? `/repos/${repoId}/files/${node.path}?branch=${encodeURIComponent(branch)}`
      : undefined,
  );
</script>

<div
  data-tree-node
  data-kind={node.kind}
  data-path={node.path}
  data-depth={depth}
  class={cn("flex flex-col")}
  style="padding-left: {depth * 16}px"
>
  {#if node.kind === "directory"}
    <button
      type="button"
      data-tree-toggle
      onclick={toggle}
      class={cn(
        "flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent rounded-sm w-full text-left",
      )}
    >
      <span class={cn("text-muted-foreground text-xs")}>{expanded ? "▼" : "▶"}</span>
      <span class={cn("font-medium")}>{fileName(node.path)}</span>
      {#if loading}
        <span class={cn("text-xs text-muted-foreground animate-pulse")}>...</span>
      {/if}
    </button>
    {#if expanded}
      <div data-tree-children>
        {#each children as child (child.id)}
          <svelte:self node={child} {repoId} {branch} depth={depth + 1} />
        {/each}
      </div>
    {/if}
  {:else}
    <a
      href={fileHref}
      data-tree-file
      class={cn(
        "flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-accent rounded-sm",
      )}
    >
      <span class={cn("text-muted-foreground text-xs")}>📄</span>
      <span>{fileName(node.path)}</span>
    </a>
  {/if}
</div>
