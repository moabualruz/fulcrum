<script lang="ts">
  type Comment = { id: string; author: string; body: string; ts: string };
  type Thread = { id: string; blockId: string; comments: Comment[]; resolved: boolean };

  const BLOCKS = ["b1", "b2", "b3"] as const;

  let threads = $state<Thread[]>([
    { id: "t1", blockId: "b1", comments: [{ id: "c1", author: "Ada", body: "Tighten this sentence.", ts: "10:01" }], resolved: false },
  ]);
  let hoveredBlock = $state<string | null>(null);
  let openThreadFor = $state<string | null>(null);
  let newReply = $state("");

  function hover(blockId: string | null): void { hoveredBlock = blockId; }
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
    threads = [...threads, { id: `t${threads.length + 1}`, blockId: openThreadFor, comments: [], resolved: false }];
  }

  function resolve(): void {
    if (!openThreadFor) return;
    threads = threads.map((th) => (th.blockId === openThreadFor ? { ...th, resolved: true } : th));
  }

  function threadFor(blockId: string): Thread | undefined {
    return threads.find((t) => t.blockId === blockId);
  }
</script>

<svelte:head><title>Block threads | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-block-thread-page>
  <h1 class="text-2xl font-semibold">Comment thread per block</h1>

  <section class="space-y-2">
    {#each BLOCKS as id}
      <p
        data-block-id={id}
        onmouseenter={() => hover(id)}
        onmouseleave={() => hover(null)}
        class="group flex items-center justify-between rounded-md border border-border p-3 text-sm"
      >
        Block {id}
        <span class="flex items-center gap-2 text-xs">
          {#if hoveredBlock === id || threadFor(id)}
            <button type="button" data-block-thread-toggle={id} onclick={() => open(id)} class="rounded-md border border-border px-2 py-0.5">
              {threadFor(id) ? `Thread (${threadFor(id)!.comments.length})` : "Comment"}
            </button>
          {/if}
        </span>
      </p>
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
