<script lang="ts">
  /**
   * ReviewWorkbench — Plannotator-derived review editor adapted to Svelte.
   * Provenance: Plannotator packages/review-editor/components/ (commit 4c8338f)
   * Adapted: React → Svelte 5 runes, Plannotator data model → Fulcrum review tRPC API
   */
  import { cn } from "$lib/utils.js";

  interface ReviewFile {
    path: string;
    oldPath?: string;
    patch: string;
    additions: number;
    deletions: number;
    index?: number;
    viewed?: boolean;
    active?: boolean;
    annotationCount: number;
    searchMatchCount: number;
  }

  interface TreeNode {
    type: "file" | "folder";
    name: string;
    path: string;
    additions: number;
    deletions: number;
    fileIndex?: number;
    children?: TreeNode[];
  }

  interface Annotation {
    id: string;
    type: string;
    scope?: "file" | "line";
    filePath: string;
    lineStart: number;
    lineEnd: number;
    side?: "old" | "new";
    text?: string;
    severity?: string;
    suggestedCode?: string;
    originalCode?: string;
    conventionalLabel?: string;
    decorations?: string[];
  }

  interface AnnotationGroup {
    filePath: string;
    annotations: Annotation[];
    blockingCount: number;
    suggestionCount: number;
  }

  interface SearchMatch {
    id: string;
    filePath: string;
    side: "addition" | "deletion" | "context";
    lineNumber: number;
    snippet: string;
  }

  interface ReviewModel {
    projectId?: string;
    traceId?: string;
    reviewId?: string;
    files: ReviewFile[];
    selectedFile: ReviewFile | null;
    fileTree: TreeNode[];
    annotationGroups: AnnotationGroup[];
    search: {
      query: string;
      groups: Array<{ filePath: string; matches: SearchMatch[] }>;
      activeMatch: SearchMatch | null;
    };
    suggestions: Array<{
      annotationId: string;
      filePath: string;
      lineStart: number;
      lineEnd: number;
      canApply: boolean;
      originalCode?: string;
      suggestedCode: string;
    }>;
    feedbackMarkdown: string;
    liveLog: {
      displayText: string;
      isLive?: boolean;
      hasOutput?: boolean;
    };
    summary: {
      fileCount: number;
      viewedFileCount: number;
      annotationCount: number;
      blockingAnnotationCount: number;
      suggestionCount: number;
      searchMatchCount: number;
    };
  }

  interface Props {
    model: ReviewModel;
    onSelectFile?: (path: string) => void;
    onAnnotate?: (annotation: Partial<Annotation>) => void;
    onSearch?: (query: string) => void;
    onSendFeedback?: () => void;
    onApprove?: () => void;
  }

  let { model, onSelectFile, onAnnotate, onSearch, onSendFeedback, onApprove }: Props = $props();

  let searchQuery = $state(model.search.query ?? "");
  let sidebarTab = $state<"files" | "annotations" | "search" | "ai">("files");
</script>

<div data-review-workbench class={cn("grid h-[calc(100vh-12rem)] grid-cols-[16rem_1fr_18rem] gap-0 rounded-lg border border-border overflow-hidden")}>
  <!-- File Tree Sidebar -->
  <aside data-review-file-tree class={cn("flex flex-col border-r border-border bg-muted/30 overflow-y-auto")}>
    <header class={cn("flex items-center justify-between border-b border-border px-3 py-2")}>
      <span class={cn("text-xs font-semibold text-muted-foreground uppercase tracking-wide")}>Files</span>
      <span class={cn("text-xs text-muted-foreground")}>{model.summary.viewedFileCount}/{model.summary.fileCount}</span>
    </header>
    <div class={cn("flex-1 overflow-y-auto p-1")}>
      {#each model.fileTree as node (node.path)}
        {@render treeNode(node, 0)}
      {/each}
      {#if model.fileTree.length === 0}
        <p class={cn("px-3 py-4 text-xs text-muted-foreground text-center")}>No files</p>
      {/if}
    </div>
  </aside>

  <!-- Diff Pane -->
  <main data-review-diff-pane class={cn("flex flex-col overflow-hidden")}>
    {#if model.selectedFile}
      <header class={cn("flex items-center gap-2 border-b border-border px-3 py-2 bg-muted/20")}>
        <span class={cn("font-mono text-xs")}>{model.selectedFile.path}</span>
        <span class={cn("ml-auto text-xs")}>
          <span class={cn("text-green-600")}>+{model.selectedFile.additions}</span>
          <span class={cn("text-red-500 ml-1")}>-{model.selectedFile.deletions}</span>
        </span>
      </header>
      <div class={cn("flex-1 overflow-auto font-mono text-xs leading-5")}>
        {#each model.selectedFile.patch.split("\n") as line, i (i)}
          <div
            data-diff-line={i}
            class={cn("px-3 py-0 flex gap-2", {
              "bg-green-50 text-green-800": line.startsWith("+") && !line.startsWith("+++"),
              "bg-red-50 text-red-800": line.startsWith("-") && !line.startsWith("---"),
              "bg-blue-50/50 text-blue-700": line.startsWith("@@"),
              "text-muted-foreground": !line.startsWith("+") && !line.startsWith("-") && !line.startsWith("@@"),
            })}
          >
            <span class={cn("w-8 shrink-0 text-right text-muted-foreground select-none")}>{i + 1}</span>
            <pre class={cn("flex-1 whitespace-pre-wrap break-all")}>{line}</pre>
          </div>
        {/each}
      </div>
    {:else}
      <div class={cn("flex flex-1 items-center justify-center text-muted-foreground text-sm")}>
        Select a file to view diff
      </div>
    {/if}
  </main>

  <!-- Annotation / Search / AI Sidebar -->
  <aside data-annotation-sidebar class={cn("flex flex-col border-l border-border bg-muted/30 overflow-hidden")}>
    <nav class={cn("flex border-b border-border")}>
      {#each [
        { id: "files", label: "Files" },
        { id: "annotations", label: `Notes (${model.summary.annotationCount})` },
        { id: "search", label: "Search" },
        { id: "ai", label: "AI" },
      ] as tab (tab.id)}
        <button
          type="button"
          class={cn(
            "flex-1 px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
            sidebarTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onclick={() => { sidebarTab = tab.id as typeof sidebarTab; }}
        >{tab.label}</button>
      {/each}
    </nav>

    <div class={cn("flex-1 overflow-y-auto p-2")}>
      {#if sidebarTab === "annotations"}
        {#each model.annotationGroups as group (group.filePath)}
          <div class={cn("mb-3")}>
            <button
              type="button"
              class={cn("w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground px-1 py-0.5")}
              onclick={() => onSelectFile?.(group.filePath)}
            >
              {group.filePath}
              {#if group.blockingCount > 0}
                <span class={cn("text-destructive ml-1")}>{group.blockingCount} blocking</span>
              {/if}
            </button>
            {#each group.annotations as ann (ann.id)}
              <div class={cn("ml-2 mt-1 rounded border border-border p-2 text-xs", {
                "border-l-2 border-l-destructive": ann.severity === "blocking",
                "border-l-2 border-l-yellow-400": ann.severity === "warning",
              })}>
                {#if ann.conventionalLabel}
                  <span class={cn("font-semibold text-primary")}>{ann.conventionalLabel}:</span>
                {/if}
                <p class={cn("mt-0.5")}>{ann.text}</p>
                {#if ann.suggestedCode}
                  <pre class={cn("mt-1 rounded bg-muted p-1.5 text-xs overflow-x-auto")}>{ann.suggestedCode}</pre>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
        {#if model.annotationGroups.length === 0}
          <p class={cn("text-center text-xs text-muted-foreground py-4")}>No annotations</p>
        {/if}

      {:else if sidebarTab === "search"}
        <div class={cn("mb-2")}>
          <input
            data-review-search
            type="text"
            placeholder="Search in diff..."
            bind:value={searchQuery}
            oninput={() => onSearch?.(searchQuery)}
            class={cn("w-full h-8 rounded border border-input bg-background px-2 text-xs")}
          />
        </div>
        <div data-search-results>
          {#each model.search.groups as group (group.filePath)}
            <div class={cn("mb-2")}>
              <p class={cn("text-xs font-medium text-muted-foreground px-1")}>{group.filePath}</p>
              {#each group.matches as match (match.id)}
                <button
                  type="button"
                  class={cn("w-full text-left px-2 py-1 text-xs rounded hover:bg-muted/50", {
                    "bg-muted": model.search.activeMatch?.id === match.id,
                  })}
                  onclick={() => onSelectFile?.(match.filePath)}
                >
                  <span class={cn("text-muted-foreground")}>L{match.lineNumber}</span>
                  <span class={cn("ml-1")}>{match.snippet}</span>
                </button>
              {/each}
            </div>
          {/each}
        </div>

      {:else if sidebarTab === "ai"}
        <div class={cn("flex flex-col gap-2 py-2")}>
          <p class={cn("text-xs text-muted-foreground")}>AI review assistant</p>
          <textarea
            placeholder="Ask about this diff..."
            rows="3"
            class={cn("w-full rounded border border-input bg-background px-2 py-1.5 text-xs resize-none")}
          ></textarea>
          <button
            type="button"
            class={cn("self-end rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground")}
          >Ask AI</button>
        </div>

      {:else}
        <div class={cn("space-y-1")}>
          {#each model.files as file (file.path)}
            <button
              type="button"
              class={cn("w-full text-left rounded px-2 py-1 text-xs hover:bg-muted/50 flex items-center gap-1", {
                "bg-muted": model.selectedFile?.path === file.path,
              })}
              onclick={() => onSelectFile?.(file.path)}
            >
              {#if file.viewed}
                <span class={cn("text-green-500")}>✓</span>
              {/if}
              <span class={cn("flex-1 truncate")}>{file.path}</span>
              <span class={cn("text-green-600 text-xs")}>+{file.additions}</span>
              <span class={cn("text-red-500 text-xs")}>-{file.deletions}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Action bar -->
    <footer class={cn("border-t border-border p-2 flex gap-2")}>
      <button
        type="button"
        data-review-send-feedback
        onclick={() => onSendFeedback?.()}
        class={cn("flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted/50")}
      >Send Feedback</button>
      <button
        type="button"
        data-review-approve
        onclick={() => onApprove?.()}
        class={cn("flex-1 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700")}
      >Approve</button>
    </footer>
  </aside>
</div>

<!-- Live log dock -->
{#if model.liveLog.hasOutput}
  <div data-live-log class={cn("mt-2 rounded border border-border bg-muted/20 p-2")}>
    <div class={cn("flex items-center gap-2 mb-1")}>
      <span class={cn("text-xs font-medium")}>Live Log</span>
      {#if model.liveLog.isLive}
        <span class={cn("h-2 w-2 rounded-full bg-green-500 animate-pulse")}></span>
      {/if}
    </div>
    <pre class={cn("text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto")}>{model.liveLog.displayText}</pre>
  </div>
{/if}

{#snippet treeNode(node: TreeNode, depth: number)}
  {#if node.type === "folder"}
    <details open class={cn("ml-" + String(depth * 2))}>
      <summary class={cn("cursor-pointer text-xs font-medium text-muted-foreground px-2 py-0.5 hover:text-foreground")}>
        📁 {node.name}
      </summary>
      {#each node.children ?? [] as child (child.path)}
        {@render treeNode(child, depth + 1)}
      {/each}
    </details>
  {:else}
    <button
      type="button"
      class={cn("w-full text-left text-xs px-2 py-0.5 rounded hover:bg-muted/50 flex items-center gap-1",
        { "bg-muted": model.selectedFile?.path === node.path }
      )}
      style="padding-left: {depth * 0.5 + 0.5}rem"
      onclick={() => onSelectFile?.(node.path)}
    >
      <span class={cn("flex-1 truncate")}>{node.name}</span>
      <span class={cn("text-green-600")}>+{node.additions}</span>
      <span class={cn("text-red-500")}>-{node.deletions}</span>
    </button>
  {/if}
{/snippet}
