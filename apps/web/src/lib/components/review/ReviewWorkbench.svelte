<script lang="ts">
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
    selectedText?: string;
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

  interface AiMessage {
    role: "user" | "assistant";
    content: string;
    streaming?: boolean;
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
    aiStreamUrl?: string;
    onSelectFile?: (path: string) => void;
    onAnnotate?: (annotation: Partial<Annotation>) => void;
    onSearch?: (query: string) => void;
    onAskAi?: (question: string, context: { filePath?: string; lineStart?: number; lineEnd?: number }) => void;
    onSendFeedback?: () => void;
    onApprove?: () => void;
  }

  let { model, aiStreamUrl, onSelectFile, onAnnotate, onSearch, onAskAi, onSendFeedback, onApprove }: Props = $props();

  let searchQuery = $state(model.search.query ?? "");
  let sidebarTab = $state<"files" | "annotations" | "search" | "ai">("files");
  let annotationDraft = $state<{ lineStart: number; lineEnd: number; text: string; selectedText: string; side: "old" | "new" } | null>(null);

  // Multi-line selection state
  let selectionAnchor = $state<number | null>(null);
  let selectionEnd = $state<number | null>(null);
  let highlightedAnnotationLine = $state<number | null>(null);

  // AI review session state
  let aiMessages = $state<AiMessage[]>([]);
  let aiInput = $state("");
  let aiStreaming = $state(false);
  let aiEventSource: EventSource | null = null;

  const selectionRange = $derived<{ start: number; end: number } | null>(
    selectionAnchor !== null && selectionEnd !== null
      ? { start: Math.min(selectionAnchor, selectionEnd) + 1, end: Math.max(selectionAnchor, selectionEnd) + 1 }
      : null
  );

  function selectedPatchLines(startIndex: number, endIndex: number): string[] {
    if (!model.selectedFile) return [];
    const [start, end] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
    return model.selectedFile.patch.split("\n").slice(start, end + 1);
  }

  function cleanPatchLine(line: string): string {
    if (line.startsWith("+") && !line.startsWith("+++")) return line.slice(1);
    if (line.startsWith("-") && !line.startsWith("---")) return line.slice(1);
    if (line.startsWith(" ")) return line.slice(1);
    return line;
  }

  function selectionSide(lines: string[]): "old" | "new" {
    return lines.some((line) => line.startsWith("-") && !line.startsWith("---")) ? "old" : "new";
  }

  function buildAnnotationDraft(startIndex: number, endIndex: number) {
    const range = { start: Math.min(startIndex, endIndex) + 1, end: Math.max(startIndex, endIndex) + 1 };
    const lines = selectedPatchLines(startIndex, endIndex);
    return {
      lineStart: range.start,
      lineEnd: range.end,
      text: "",
      selectedText: lines.map(cleanPatchLine).join("\n"),
      side: selectionSide(lines),
    };
  }

  function handleLineClick(lineIndex: number, event: MouseEvent): void {
    if (!model.selectedFile) return;

    if (event.shiftKey && selectionAnchor !== null) {
      selectionEnd = lineIndex;
      annotationDraft = buildAnnotationDraft(selectionAnchor, lineIndex);
      sidebarTab = "annotations";
    } else {
      selectionAnchor = lineIndex;
      selectionEnd = lineIndex;
      annotationDraft = buildAnnotationDraft(lineIndex, lineIndex);
      sidebarTab = "annotations";
    }
  }

  function handleLineDrag(lineIndex: number): void {
    if (!model.selectedFile || selectionAnchor === null) return;
    selectionEnd = lineIndex;
    annotationDraft = buildAnnotationDraft(selectionAnchor, lineIndex);
  }

  function handleMouseUp(): void {
    // Selection finalized on mouseup — draft already set via drag
  }

  function scrollToLine(line: number): void {
    const el = document.querySelector(`[data-diff-line="${line - 1}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightedAnnotationLine = line;
      setTimeout(() => { highlightedAnnotationLine = null; }, 2000);
    }
  }

  function handleAnnotationClick(annotation: Annotation): void {
    if (annotation.filePath !== model.selectedFile?.path) {
      onSelectFile?.(annotation.filePath);
      requestAnimationFrame(() => scrollToLine(annotation.lineStart));
    } else {
      scrollToLine(annotation.lineStart);
    }
  }

  function submitAnnotation(): void {
    if (!annotationDraft || !model.selectedFile) return;
    onAnnotate?.({
      filePath: model.selectedFile.path,
      lineStart: annotationDraft.lineStart,
      lineEnd: annotationDraft.lineEnd,
      text: annotationDraft.text,
      type: "comment",
      scope: "line",
      side: annotationDraft.side,
      selectedText: annotationDraft.selectedText,
      originalCode: annotationDraft.selectedText,
    });
    annotationDraft = null;
    selectionAnchor = null;
    selectionEnd = null;
  }

  function cancelAnnotation(): void {
    annotationDraft = null;
    selectionAnchor = null;
    selectionEnd = null;
  }

  // AI streaming
  function askAi(): void {
    const question = aiInput.trim();
    if (!question) return;

    const context = {
      filePath: model.selectedFile?.path,
      lineStart: selectionRange?.start,
      lineEnd: selectionRange?.end,
    };

    aiMessages = [...aiMessages, { role: "user", content: question }];
    aiInput = "";

    if (onAskAi) {
      onAskAi(question, context);
    }

    if (aiStreamUrl) {
      startAiStream(question, context);
    }
  }

  function startAiStream(question: string, context: { filePath?: string; lineStart?: number; lineEnd?: number }): void {
    aiStreaming = true;
    const params = new URLSearchParams({
      q: question,
      ...(context.filePath ? { file: context.filePath } : {}),
      ...(context.lineStart ? { lineStart: String(context.lineStart) } : {}),
      ...(context.lineEnd ? { lineEnd: String(context.lineEnd) } : {}),
      ...(model.traceId ? { traceId: model.traceId } : {}),
      ...(model.reviewId ? { reviewId: model.reviewId } : {}),
    });

    const streamMsg: AiMessage = { role: "assistant", content: "", streaming: true };
    aiMessages = [...aiMessages, streamMsg];

    aiEventSource = new EventSource(`${aiStreamUrl}?${params.toString()}`);
    aiEventSource.onmessage = (event) => {
      const last = aiMessages[aiMessages.length - 1];
      if (last?.streaming) {
        aiMessages = [...aiMessages.slice(0, -1), { ...last, content: last.content + event.data }];
      }
    };
    aiEventSource.addEventListener("done", () => {
      stopAiStream();
    });
    aiEventSource.onerror = () => {
      stopAiStream();
    };
  }

  function stopAiStream(): void {
    aiEventSource?.close();
    aiEventSource = null;
    aiStreaming = false;
    const last = aiMessages[aiMessages.length - 1];
    if (last?.streaming) {
      aiMessages = [...aiMessages.slice(0, -1), { ...last, streaming: false }];
    }
  }

  function isLineInSelection(lineIndex: number): boolean {
    if (!selectionRange) return false;
    return lineIndex + 1 >= selectionRange.start && lineIndex + 1 <= selectionRange.end;
  }
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
      <div class={cn("flex-1 overflow-auto font-mono text-xs leading-5")} role="listbox" aria-label="Diff lines" onmouseup={handleMouseUp}>
        {#each model.selectedFile.patch.split("\n") as line, i (i)}
          <div
            data-diff-line={i}
            class={cn("px-3 py-0 flex gap-2 cursor-pointer hover:bg-primary/5 group select-none", {
              "bg-green-50 text-green-800 hover:bg-green-100": line.startsWith("+") && !line.startsWith("+++") && !isLineInSelection(i),
              "bg-red-50 text-red-800 hover:bg-red-100": line.startsWith("-") && !line.startsWith("---") && !isLineInSelection(i),
              "bg-blue-50/50 text-blue-700": line.startsWith("@@") && !isLineInSelection(i),
              "text-muted-foreground": !line.startsWith("+") && !line.startsWith("-") && !line.startsWith("@@") && !isLineInSelection(i),
              "!bg-primary/15 ring-1 ring-primary/40": isLineInSelection(i),
              "!bg-yellow-100 ring-1 ring-yellow-400": highlightedAnnotationLine === i + 1,
            })}
            role="option"
            aria-selected={isLineInSelection(i)}
            tabindex="0"
            onclick={(e) => handleLineClick(i, e)}
            onmousedown={() => { selectionAnchor = i; selectionEnd = i; }}
            onmouseenter={(e) => { if (e.buttons === 1) handleLineDrag(i); }}
            onkeydown={(e) => { if (e.key === "Enter") handleLineClick(i, e as unknown as MouseEvent); }}
          >
            <span class={cn("w-8 shrink-0 text-right text-muted-foreground select-none")}>{i + 1}</span>
            <pre class={cn("flex-1 whitespace-pre-wrap break-all")}>{line}</pre>
            <span class={cn("opacity-0 group-hover:opacity-100 text-xs text-primary shrink-0")}>+</span>
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
        {#if annotationDraft}
          <div data-annotation-draft class={cn("mb-3 rounded border border-primary/30 bg-primary/5 p-2")}>
            <p class={cn("text-xs font-medium mb-1")}>
              New annotation — {annotationDraft.lineStart === annotationDraft.lineEnd ? `Line ${annotationDraft.lineStart}` : `Lines ${annotationDraft.lineStart}-${annotationDraft.lineEnd}`}
            </p>
            {#if annotationDraft.selectedText}
              <pre data-annotation-selected-text class={cn("mb-2 max-h-24 overflow-y-auto rounded bg-background/80 p-1.5 text-[11px] whitespace-pre-wrap")}>{annotationDraft.selectedText}</pre>
            {/if}
            <textarea
              bind:value={annotationDraft.text}
              placeholder="Write your comment..."
              rows="3"
              class={cn("w-full rounded border border-input bg-background px-2 py-1.5 text-xs resize-none")}
            ></textarea>
            <div class={cn("mt-1 flex gap-1")}>
              <button type="button" onclick={submitAnnotation} class={cn("rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground")}>Add</button>
              <button type="button" onclick={cancelAnnotation} class={cn("rounded border border-border px-2 py-1 text-xs")}>Cancel</button>
            </div>
          </div>
        {/if}
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
              <button
                type="button"
                data-annotation-id={ann.id}
                class={cn("ml-2 mt-1 w-[calc(100%-0.5rem)] text-left rounded border border-border p-2 text-xs cursor-pointer hover:bg-muted/50 transition-colors", {
                  "border-l-2 border-l-destructive": ann.severity === "blocking",
                  "border-l-2 border-l-yellow-400": ann.severity === "warning",
                })}
                onclick={() => handleAnnotationClick(ann)}
              >
                <div class={cn("flex items-center gap-1 text-muted-foreground mb-0.5")}>
                  <span class={cn("text-[10px]")}>L{ann.lineStart}{ann.lineEnd !== ann.lineStart ? `-${ann.lineEnd}` : ""}</span>
                  {#if ann.conventionalLabel}
                    <span class={cn("font-semibold text-primary")}>{ann.conventionalLabel}:</span>
                  {/if}
                </div>
                <p class={cn("mt-0.5")}>{ann.text}</p>
                {#if ann.suggestedCode}
                  <pre class={cn("mt-1 rounded bg-muted p-1.5 text-xs overflow-x-auto")}>{ann.suggestedCode}</pre>
                {/if}
              </button>
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
        <div data-review-ai-panel class={cn("flex flex-col h-full")}>
          <div class={cn("flex-1 overflow-y-auto space-y-2 pb-2")}>
            {#if aiMessages.length === 0}
              <p class={cn("text-xs text-muted-foreground py-4 text-center")}>Ask about this diff or selection</p>
            {/if}
            {#each aiMessages as msg, i (i)}
              <div class={cn("rounded p-2 text-xs", {
                "bg-primary/10 text-foreground": msg.role === "user",
                "bg-muted/50 text-foreground": msg.role === "assistant",
              })}>
                {#if msg.role === "assistant" && msg.streaming}
                  <div class={cn("flex items-center gap-1 mb-1")}>
                    <span class={cn("h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse")}></span>
                    <span class={cn("text-[10px] text-muted-foreground")}>streaming</span>
                  </div>
                {/if}
                <pre class={cn("whitespace-pre-wrap break-words font-sans")}>{msg.content || "..."}</pre>
              </div>
            {/each}
          </div>
          <div class={cn("border-t border-border pt-2 space-y-1")}>
            {#if selectionRange}
              <div class={cn("text-[10px] text-muted-foreground px-1")}>
                Context: {model.selectedFile?.path ?? "file"} L{selectionRange.start}-{selectionRange.end}
              </div>
            {/if}
            <textarea
              data-review-ai-input
              bind:value={aiInput}
              placeholder="Ask about this diff..."
              rows="2"
              disabled={aiStreaming}
              onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAi(); } }}
              class={cn("w-full rounded border border-input bg-background px-2 py-1.5 text-xs resize-none")}
            ></textarea>
            <div class={cn("flex gap-1")}>
              <button
                type="button"
                data-review-ai-ask
                onclick={askAi}
                disabled={aiStreaming || !aiInput.trim()}
                class={cn("flex-1 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50")}
              >{aiStreaming ? "Streaming..." : "Ask AI"}</button>
              {#if aiStreaming}
                <button
                  type="button"
                  onclick={stopAiStream}
                  class={cn("rounded border border-border px-2 py-1 text-xs")}
                >Stop</button>
              {/if}
            </div>
          </div>
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
