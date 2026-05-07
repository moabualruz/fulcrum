<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import { buttonVariants } from "$lib/components/ui/button";
  import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import FileTextIcon from "@lucide/svelte/icons/file-text";

  import { buildDocTree, type DocTreeNode, type DocScope } from "./doc-tree.js";

  interface DndItem {
    id: string;
    node: DocTreeNode;
    depth: number;
  }

  interface Props {
    title: string;
    scope: DocScope;
    nodes: DocTreeNode[];
    selectedDocId?: string | null;
    onUpdatePosition?: (id: string, parentId: string | null, sortPosition: number) => Promise<void>;
  }

  let {
    title,
    scope,
    nodes = [],
    selectedDocId = null,
    onUpdatePosition,
  }: Props = $props();

  // Expanded state per node id
  let expanded = $state<Record<string, boolean>>({});
  // Inline new doc name input
  let newDocName = $state("");
  let showNewDocInput = $state(false);

  /** Flatten tree into dnd-compatible items (respects expanded state). */
  function flattenForDnd(items: DocTreeNode[], depth = 0): DndItem[] {
    return items.flatMap((node) => {
      const isExpanded = expanded[node.id] ?? (node.children.length > 0);
      return [
        { id: node.id, node, depth },
        ...(isExpanded && node.children.length > 0 ? flattenForDnd(node.children, depth + 1) : []),
      ];
    });
  }

  let flatItems = $state<DndItem[]>([]);

  $effect(() => {
    flatItems = flattenForDnd(nodes, 0);
  });

  function toggleExpand(id: string) {
    expanded = { ...expanded, [id]: !(expanded[id] ?? true) };
  }

  function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
    flatItems = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
    flatItems = e.detail.items;
    if (!onUpdatePosition) return;

    // Recalculate parent and sortPosition based on new flat order + depth
    for (let i = 0; i < flatItems.length; i++) {
      const item = flatItems[i];
      // Find parent: scan backwards for an item with depth = current depth - 1
      let parentId: string | null = null;
      if (item.depth > 0) {
        for (let j = i - 1; j >= 0; j--) {
          if (flatItems[j].depth === item.depth - 1) {
            parentId = flatItems[j].id;
            break;
          }
        }
      }
      // sortPosition = index among siblings
      const siblings = flatItems.filter((x, xi) => xi < i && x.depth === item.depth && (
        item.depth === 0 ||
        flatItems.slice(0, xi + 1).reverse().find((y) => y.depth === item.depth - 1)?.id === parentId
      ));
      await onUpdatePosition(item.id, parentId, siblings.length);
    }
  }
</script>

<aside
  data-docs-sidebar
  class={cn("flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background")}
>
  <!-- Header -->
  <header class={cn("flex items-center justify-between gap-2 border-b border-border px-3 py-2")}>
    <h2 class={cn("text-sm font-semibold truncate")}>{title}</h2>
    <button
      data-new-doc
      class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-6 shrink-0")}
      onclick={() => { showNewDocInput = !showNewDocInput; }}
      title="New document"
      aria-label="New document"
    >
      <PlusIcon class={cn("size-3.5")} />
    </button>
  </header>

  <!-- Inline new doc name input -->
  {#if showNewDocInput}
    <form
      data-new-doc-form
      class={cn("flex items-center gap-1 border-b border-border px-2 py-1.5")}
      onsubmit={(e) => {
        e.preventDefault();
        if (newDocName.trim()) {
          // Navigate to new doc page with pre-filled title
          window.location.href = `/docs/new?scope=${scope}&title=${encodeURIComponent(newDocName.trim())}`;
        }
      }}
    >
      <input
        data-new-doc-input
        bind:value={newDocName}
        placeholder="Document name…"
        autofocus
        class={cn("h-7 flex-1 min-w-0 rounded border border-input bg-background px-2 text-xs")}
        onkeydown={(e) => { if (e.key === "Escape") { showNewDocInput = false; newDocName = ""; } }}
      />
    </form>
  {/if}

  <!-- Tree with dnd -->
  <nav
    data-doc-tree-nav
    class={cn("flex-1 overflow-y-auto p-1")}
    aria-label={title}
  >
    {#if flatItems.length === 0}
      <p class={cn("px-2 py-6 text-xs text-muted-foreground text-center")}>No documents.</p>
    {:else}
      <ul
        role="tree"
        aria-label={title}
        use:dndzone={{ items: flatItems, flipDurationMs: 120, dropTargetStyle: { outline: "2px solid hsl(var(--primary))" } }}
        onconsider={handleDndConsider}
        onfinalize={handleDndFinalize}
        class={cn("flex flex-col gap-0.5")}
      >
        {#each flatItems as item (item.id)}
          {@const node = item.node}
          {@const hasChildren = node.children.length > 0}
          {@const isExpanded = expanded[node.id] ?? true}
          {@const isActive = selectedDocId === node.id}

          <li
            role="treeitem"
            aria-level={item.depth + 1}
            aria-selected={isActive}
            aria-expanded={hasChildren ? isExpanded : undefined}
            data-doc-node
            data-doc-node-id={node.id}
            data-doc-depth={item.depth}
            class={cn(
              "group flex min-h-8 items-center gap-1 rounded text-sm",
              isActive && "bg-secondary border-l-2 border-primary",
              !isActive && "hover:bg-muted",
            )}
            style={`padding-left: ${item.depth * 12 + 4}px; padding-right: 4px;`}
          >
            <!-- Drag handle -->
            <span
              data-drag-handle
              class={cn("shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity")}
              aria-hidden="true"
            >
              <GripVerticalIcon class={cn("size-3 text-muted-foreground")} />
            </span>

            <!-- Expand/collapse chevron -->
            {#if hasChildren}
              <button
                data-expand-toggle={node.id}
                class={cn("shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground")}
                onclick={(e) => { e.preventDefault(); toggleExpand(node.id); }}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {#if isExpanded}
                  <ChevronDownIcon class={cn("size-3")} />
                {:else}
                  <ChevronRightIcon class={cn("size-3")} />
                {/if}
              </button>
            {:else}
              <!-- Spacer to keep alignment -->
              <span class={cn("size-5 shrink-0")} aria-hidden="true">
                <FileTextIcon class={cn("size-3 text-muted-foreground/40 mt-1")} />
              </span>
            {/if}

            <!-- Title link -->
            <a
              href="/docs/{node.id}"
              class={cn("min-w-0 flex-1 truncate py-1 text-sm leading-tight", isActive && "font-medium text-foreground")}
            >{node.title}</a>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>
</aside>
