<script lang="ts">
  type Comment = { id: string; author: string; body: string; ts: string };
  type Thread = { id: string; blockId: string; selection: string; comments: Comment[]; resolved: boolean };

  const BLOCKS = [
    {
      id: "b1",
      line: 12,
      prefix: "The ",
      selection: "architecture decision",
      suffix: " must remain linked to the approving trace.",
    },
    {
      id: "b2",
      line: 19,
      prefix: "Reviewer feedback should identify the ",
      selection: "source text",
      suffix: " without forcing a sidebar search.",
    },
    {
      id: "b3",
      line: 27,
      prefix: "Resolved discussion markers stay available as ",
      selection: "faded references",
      suffix: " until the final review closes.",
    },
  ] as const;

  let threads = $state<Thread[]>([
    {
      id: "t1",
      blockId: "b1",
      selection: "architecture decision",
      comments: [{ id: "c1", author: "Ada", body: "Need consensus before approval.", ts: "10:01" }],
      resolved: false,
    },
    {
      id: "t2",
      blockId: "b3",
      selection: "faded references",
      comments: [{ id: "c1", author: "Mina", body: "Resolved after owner reply.", ts: "10:04" }],
      resolved: true,
    },
  ]);
  let hoveredBlock = $state<string | null>(null);
  let hoveredPin = $state<string | null>(null);
  let openThreadFor = $state<string | null>(null);
  let newReply = $state("");

  function hover(blockId: string | null): void { hoveredBlock = blockId; }
  function hoverPin(blockId: string | null): void { hoveredPin = blockId; }
  function open(blockId: string): void { openThreadFor = blockId; }
  function close(): void { openThreadFor = null; }

  function reply(): void {
    if (!openThreadFor || !newReply.trim()) return;
    threads = threads.map((th) =>
      th.blockId === openThreadFor
        ? { ...th, comments: [...th.comments, { id: `c${th.comments.length + 1}`, author: "you", body: newReply.trim(), ts: "10:02" }] }
        : th,
    );
    newReply = "";
  }

  function startThread(): void {
    if (!openThreadFor) return;
    if (threads.some((t) => t.blockId === openThreadFor)) return;
    const block = BLOCKS.find((item) => item.id === openThreadFor);
    threads = [...threads, {
      id: `t${threads.length + 1}`,
      blockId: openThreadFor,
      selection: block?.selection ?? openThreadFor,
      comments: [],
      resolved: false,
    }];
  }

  function resolve(): void {
    if (!openThreadFor) return;
    threads = threads.map((th) => (th.blockId === openThreadFor ? { ...th, resolved: true } : th));
  }

  function deleteMark(blockId: string): void {
    threads = threads.filter((th) => th.blockId !== blockId);
    if (openThreadFor === blockId) openThreadFor = null;
  }

  function threadFor(blockId: string): Thread | undefined {
    return threads.find((t) => t.blockId === blockId);
  }

  function previewFor(blockId: string): string {
    const first = threadFor(blockId)?.comments[0]?.body ?? "No comment yet.";
    return first.length > 50 ? `${first.slice(0, 50)}...` : first;
  }
</script>

<svelte:head><title>Block threads | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-block-thread-page>
  <h1 class="text-2xl font-semibold">Comment thread per block</h1>

  <section class="relative space-y-2 pr-12">
    <div data-margin-pin-rail class="absolute right-1 top-0 bottom-0 w-8 border-l border-border"></div>
    {#each BLOCKS as block}
      {@const thread = threadFor(block.id)}
      <div
        role="group"
        data-block-id={block.id}
        data-line-number={block.line}
        onmouseenter={() => hover(block.id)}
        onmouseleave={() => hover(null)}
        class="relative grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border p-3 text-sm"
      >
        <span class="font-mono text-xs text-muted-foreground">L{block.line}</span>
        <span class="min-w-0">
          {block.prefix}
          {#if thread}
            <button
              type="button"
              data-inline-comment-mark={block.id}
              data-resolved-marker={thread.resolved ? "true" : "false"}
              onclick={() => open(block.id)}
              class="rounded-sm border px-1 py-0.5 {thread.resolved ? 'border-border bg-muted text-muted-foreground opacity-60' : 'border-amber-500/50 bg-amber-400/20 text-foreground'}"
              title={previewFor(block.id)}
            >
              {block.selection}
              <span data-comment-count-badge={block.id} class="ml-1 rounded bg-background/80 px-1 text-[10px]">
                {thread.comments.length > 1 ? `+${thread.comments.length}` : "1"}
              </span>
            </button>
          {:else}
            <span>{block.selection}</span>
          {/if}
          {block.suffix}
        </span>
        <span class="flex items-center gap-2 text-xs">
          {#if hoveredBlock === block.id || thread}
            <button type="button" data-block-thread-toggle={block.id} onclick={() => open(block.id)} class="rounded-md border border-border px-2 py-0.5">
              {thread ? `Thread (${thread.comments.length})` : "Comment"}
            </button>
          {/if}
        </span>
        {#if thread}
          <button
            type="button"
            data-margin-pin={block.id}
            data-resolved-pin={thread.resolved ? "true" : "false"}
            aria-label={`Open thread for ${block.selection}`}
            onmouseenter={() => hoverPin(block.id)}
            onmouseleave={() => hoverPin(null)}
            onclick={() => open(block.id)}
            class="absolute -right-11 top-3 flex min-h-9 min-w-9 items-center justify-center rounded-full border border-amber-500/40 bg-background text-xs shadow-sm {thread.resolved ? 'opacity-50' : ''}"
          >
            {thread.resolved ? "✓" : thread.comments.length}
          </button>
          {#if hoveredPin === block.id}
            <div data-margin-pin-preview={block.id} class="absolute right-0 top-12 z-10 w-56 rounded-md border border-border bg-popover p-2 text-xs shadow-md">
              {previewFor(block.id)}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </section>

  {#if openThreadFor}
    {@const th = threadFor(openThreadFor)}
    <aside data-thread-panel data-thread-for={openThreadFor} class="space-y-2 rounded-md border border-border p-3">
      <header class="flex items-center justify-between">
        <h2 class="text-base font-medium">Thread on {openThreadFor}</h2>
        <button type="button" data-thread-close onclick={close} aria-label="Close thread" class="rounded-md border border-border px-2 py-0.5 text-xs">Close</button>
      </header>
      {#if th}
        <p data-thread-selection class="rounded-md bg-muted p-2 text-xs">Selection: {th.selection}</p>
        <ul class="space-y-1" data-thread-comments>
          {#each th.comments as c}
            <li data-thread-comment={c.id}>
              <strong class="text-xs">{c.author}</strong>
              <p class="text-sm">{c.body}</p>
            </li>
          {/each}
        </ul>
        {#if !th.resolved}
          <textarea data-thread-reply-input bind:value={newReply} placeholder="Reply…" rows="2" class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"></textarea>
          <div class="flex gap-2">
            <button type="button" data-thread-reply onclick={reply} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Reply</button>
            <button type="button" data-thread-resolve onclick={resolve} class="rounded-md border border-border px-3 py-1 text-xs">Resolve</button>
            <button type="button" data-delete-mark={openThreadFor} onclick={() => deleteMark(openThreadFor)} class="rounded-md border border-border px-3 py-1 text-xs">Delete mark</button>
          </div>
        {:else}
          <p data-thread-resolved class="text-xs text-muted-foreground">Resolved.</p>
        {/if}
      {:else}
        <p class="text-xs">No thread yet.</p>
        <button type="button" data-thread-start onclick={startThread} class="rounded-md border border-border px-3 py-1 text-xs">Start thread</button>
      {/if}
    </aside>
  {/if}
</main>
