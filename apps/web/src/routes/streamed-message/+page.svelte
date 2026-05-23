<script lang="ts">
  const FULL_TEXT = "I scanned the repo and located cycle.ts at apps/web/src/lib/cycle.ts. The Zod schema validates input shapes; let me explain the plan before editing.";

  let streamed = $state("");
  let streaming = $state(false);
  let copied = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  function start(): void {
    streamed = "";
    streaming = true;
    let i = 0;
    timer = setInterval(() => {
      if (i >= FULL_TEXT.length) {
        if (timer) clearInterval(timer);
        streaming = false;
        return;
      }
      streamed += FULL_TEXT.slice(i, i + 8);
      i += 8;
    }, 50);
  }

  function copy(): void {
    copied = streamed;
  }
</script>

<svelte:head><title>Streamed message | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-streamed-message-page>
  <h1 class="text-2xl font-semibold">Streamed message</h1>

  <button type="button" data-stream-start onclick={start} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Start stream</button>

  <article
    data-stream-transcript
    data-stream-streaming={streaming}
    class="space-y-1 rounded-md border border-border p-3"
    aria-live="polite"
  >
    <p data-stream-text class="whitespace-pre-wrap text-sm">{streamed}</p>
    {#if streaming}
      <p data-stream-indicator class="text-xs text-muted-foreground" aria-hidden="true">▍ streaming…</p>
    {/if}
  </article>

  <button type="button" data-stream-copy onclick={copy} disabled={!streamed} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Copy</button>
  {#if copied}
    <p data-stream-copied class="text-xs text-muted-foreground">Copied {copied.length} characters.</p>
  {/if}
</main>
