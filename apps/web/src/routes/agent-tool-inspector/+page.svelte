<script lang="ts">
  type ToolCall = {
    id: string;
    name: string;
    ts: string;
    status: "success" | "error";
    request: Record<string, unknown>;
    response: Record<string, unknown>;
  };

  const CALLS: ToolCall[] = [
    {
      id: "tc1",
      name: "read",
      ts: "10:00:05",
      status: "success",
      request: { path: "src/cycle.ts" },
      response: { bytes: 1240, encoding: "utf-8" },
    },
    {
      id: "tc2",
      name: "write",
      ts: "10:00:11",
      status: "error",
      request: { path: "src/cycle.ts", contentLength: 1280 },
      response: { error: "EACCES: permission denied" },
    },
  ];

  let activeId = $state<string>(CALLS[0]!.id);
  let copied = $state<string | null>(null);
  let downloaded = $state<string | null>(null);

  const active = $derived(CALLS.find((c) => c.id === activeId) ?? CALLS[0]!);

  function copy(part: "request" | "response"): void {
    copied = `${active.id}:${part}`;
  }

  function download(): void {
    downloaded = `${active.name}-${active.id}.json`;
  }
</script>

<svelte:head><title>Tool call inspector | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-tool-inspector-page>
  <h1 class="text-2xl font-semibold">Tool call inspector</h1>

  <ul class="flex flex-wrap gap-2" data-tool-inspector-list>
    {#each CALLS as c}
      <li>
        <button
          type="button"
          data-tool-row={c.id}
          data-tool-active={c.id === activeId}
          onclick={() => (activeId = c.id)}
          class="rounded-md border border-border px-3 py-1 text-xs"
        >
          {c.name} · <span data-tool-status={c.status}>{c.status}</span>
        </button>
      </li>
    {/each}
  </ul>

  <section data-tool-inspector-detail class="space-y-3 rounded-md border border-border p-3">
    <header class="space-y-1">
      <h2 class="text-base font-medium">
        <span data-tool-name>{active.name}</span> · <span data-tool-ts>{active.ts}</span>
      </h2>
    </header>

    <div class="space-y-1">
      <p class="flex items-center gap-2 text-xs">
        Request
        <button type="button" data-tool-copy-request onclick={() => copy("request")} class="rounded-md border border-border px-2 py-0.5">Copy</button>
      </p>
      <pre data-tool-request data-syntax="json" class="overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(active.request, null, 2)}</pre>
    </div>

    <div class="space-y-1">
      <p class="flex items-center gap-2 text-xs">
        Response
        <button type="button" data-tool-copy-response onclick={() => copy("response")} class="rounded-md border border-border px-2 py-0.5">Copy</button>
      </p>
      <pre data-tool-response data-syntax="json" class="overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(active.response, null, 2)}</pre>
    </div>

    <button type="button" data-tool-download onclick={download} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Download JSON</button>
  </section>

  {#if copied}
    <p data-tool-copied class="text-xs text-muted-foreground">Copied {copied}</p>
  {/if}
  {#if downloaded}
    <p data-tool-downloaded class="text-xs text-muted-foreground">Downloaded {downloaded}</p>
  {/if}
</main>
