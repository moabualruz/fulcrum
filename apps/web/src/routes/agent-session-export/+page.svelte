<script lang="ts">
  type Message = { role: "user" | "assistant"; content: string };
  type ToolCall = { name: string; args: Record<string, unknown>; result: string };
  type Diff = { file: string; added: number; removed: number };

  type Session = {
    title: string;
    createdAt: string;
    messages: Message[];
    toolCalls: ToolCall[];
    diffs: Diff[];
  };

  const SESSION: Session = {
    title: "Refactor cycle save",
    createdAt: "2026-05-19T10:00:00Z",
    messages: [
      { role: "user", content: "Refactor cycle save to use Zod." },
      { role: "assistant", content: "Replaced manual checks with a Zod schema in cycle.ts." },
    ],
    toolCalls: [
      { name: "read", args: { path: "src/cycle.ts" }, result: "ok" },
      { name: "write", args: { path: "src/cycle.ts" }, result: "ok" },
    ],
    diffs: [{ file: "src/cycle.ts", added: 12, removed: 4 }],
  };

  let lastExport = $state<{ format: "json" | "markdown"; filename: string; preview: string } | null>(null);

  function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function timestamp(): string {
    return SESSION.createdAt.replace(/[:.-]/g, "").replace("T", "-").replace("Z", "");
  }

  function exportJson(): void {
    const filename = `${slug(SESSION.title)}-${timestamp()}.json`;
    lastExport = { format: "json", filename, preview: JSON.stringify(SESSION, null, 2).slice(0, 200) };
  }

  function exportMarkdown(): void {
    const filename = `${slug(SESSION.title)}-${timestamp()}.md`;
    const lines: string[] = [`# ${SESSION.title}`, "", `Created: ${SESSION.createdAt}`, "", "## Messages"];
    for (const m of SESSION.messages) lines.push(`- **${m.role}**: ${m.content}`);
    lines.push("", "## Tool calls");
    for (const t of SESSION.toolCalls) lines.push(`- ${t.name}(${JSON.stringify(t.args)}) → ${t.result}`);
    lines.push("", "## Diffs");
    for (const d of SESSION.diffs) lines.push(`- ${d.file}: +${d.added} -${d.removed}`);
    lastExport = { format: "markdown", filename, preview: lines.join("\n").slice(0, 200) };
  }
</script>

<svelte:head><title>Session export | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-export-page>
  <h1 class="text-2xl font-semibold">Session export</h1>
  <p class="text-sm text-muted-foreground">Download the full session transcript, tool calls, and diffs.</p>

  <div class="flex flex-wrap gap-2">
    <button type="button" data-export-json onclick={exportJson} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Export JSON</button>
    <button type="button" data-export-markdown onclick={exportMarkdown} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Export Markdown</button>
  </div>

  {#if lastExport}
    <section data-export-result class="space-y-2 rounded-md border border-border p-3 text-xs">
      <p>Format: <span data-export-format>{lastExport.format}</span></p>
      <p>Filename: <span data-export-filename>{lastExport.filename}</span></p>
      <pre data-export-preview class="overflow-auto rounded-md bg-muted p-2">{lastExport.preview}</pre>
    </section>
  {/if}
</main>
