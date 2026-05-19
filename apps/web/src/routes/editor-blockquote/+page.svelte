<script lang="ts">
  type Block =
    | { kind: "paragraph"; text: string }
    | { kind: "quote"; text: string; author?: string }
    | { kind: "list"; items: string[] }
    | { kind: "code"; lang: string; text: string };

  let blocks = $state<Block[]>([
    { kind: "paragraph", text: "Start typing. Use > followed by space to begin a quote." },
  ]);
  let input = $state("");
  let slashMenuOpen = $state(false);
  let quoteAuthor = $state("");
  let lastAddedKind = $state<string | null>(null);

  function commit(): void {
    const trimmed = input.trim();
    if (!trimmed) return;
    const quoteMatch = /^>\s+(.+)$/.exec(trimmed);
    if (quoteMatch) {
      const body = quoteMatch[1] ?? "";
      blocks = [...blocks, { kind: "quote", text: body, author: quoteAuthor || undefined }];
      lastAddedKind = "quote";
      quoteAuthor = "";
    } else {
      blocks = [...blocks, { kind: "paragraph", text: trimmed }];
      lastAddedKind = "paragraph";
    }
    input = "";
  }

  function insertQuoteFromMenu(): void {
    slashMenuOpen = false;
    blocks = [...blocks, { kind: "quote", text: "New quote", author: quoteAuthor || undefined }];
    lastAddedKind = "quote";
    quoteAuthor = "";
  }

  function insertParagraphInsideLastQuote(): void {
    const lastQuoteIndex = blocks.map((b) => b.kind).lastIndexOf("quote");
    if (lastQuoteIndex === -1) return;
    blocks = [
      ...blocks.slice(0, lastQuoteIndex + 1),
      { kind: "paragraph", text: "Quoted paragraph" },
      { kind: "list", items: ["item a", "item b"] },
      { kind: "code", lang: "ts", text: "// quoted code" },
      ...blocks.slice(lastQuoteIndex + 1),
    ];
    lastAddedKind = "quote-children";
  }
</script>

<svelte:head><title>Editor: blockquote | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-blockquote-page>
  <h1 class="text-2xl font-semibold">Quote block</h1>
  <p class="text-sm text-muted-foreground">Type <code>&gt; </code> followed by space to start a quote, or use the slash menu.</p>

  <section class="space-y-2 rounded-md border border-border p-3" data-editor-doc>
    {#each blocks as block, i}
      {#if block.kind === "paragraph"}
        <p data-block={`paragraph-${i}`} class="text-sm">{block.text}</p>
      {:else if block.kind === "quote"}
        <blockquote
          data-block={`quote-${i}`}
          data-block-quote
          class="border-l-4 border-primary bg-muted/40 px-3 py-2 text-sm"
        >
          <p>{block.text}</p>
          {#if block.author}
            <footer data-quote-author class="mt-1 text-xs text-muted-foreground">— {block.author}</footer>
          {/if}
        </blockquote>
      {:else if block.kind === "list"}
        <ul data-block={`list-${i}`} class="ml-5 list-disc text-sm">
          {#each block.items as it}<li>{it}</li>{/each}
        </ul>
      {:else if block.kind === "code"}
        <pre data-block={`code-${i}`} data-block-lang={block.lang} class="overflow-auto rounded-md bg-muted p-2 text-xs"><code>{block.text}</code></pre>
      {/if}
    {/each}
  </section>

  <div class="space-y-2">
    <label class="flex flex-col gap-1 text-xs">
      Author (optional, stored in attrs)
      <input data-quote-author-input bind:value={quoteAuthor} class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
    </label>
    <div class="flex gap-2">
      <input
        data-editor-input
        bind:value={input}
        onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        placeholder="Type here (try '> quoted text')"
        class="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <button type="button" data-editor-commit onclick={commit} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Insert</button>
      <button type="button" data-editor-slash onclick={() => (slashMenuOpen = !slashMenuOpen)} class="rounded-md border border-border bg-background px-3 py-1 text-xs">/</button>
    </div>

    {#if slashMenuOpen}
      <ul data-slash-menu class="space-y-1 rounded-md border border-border p-2 text-xs">
        <li><button type="button" data-slash-quote onclick={insertQuoteFromMenu} class="w-full text-left">Quote</button></li>
        <li><button type="button" data-slash-nested onclick={insertParagraphInsideLastQuote} class="w-full text-left">Add nested paragraph + list + code into last quote</button></li>
      </ul>
    {/if}

    {#if lastAddedKind}
      <p data-last-added class="text-xs text-muted-foreground">Last added: {lastAddedKind}</p>
    {/if}
  </div>
</main>
