<script lang="ts">
  import favicon from "$lib/assets/favicon.svg";
  import "../app.css";
  import { fulcrumState } from "$lib/state/fulcrum-store";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <header class="border-b border-border">
    <div class="mx-auto max-w-6xl px-6 py-4 flex items-center gap-6">
      <a href="/" class="font-semibold">Fulcrum</a>
      <nav class="flex gap-4 text-sm">
        <a href="/projects" class="hover:underline">Projects</a>
        <a href="/docs" class="hover:underline">Docs</a>
        <a href="/boards" class="hover:underline">Boards</a>
        <a href="/runs" class="hover:underline">Runs</a>
      </nav>
      <div class="ml-auto text-xs text-muted-foreground">
        active: {$fulcrumState.activeProjectId ?? "—"}
      </div>
    </div>
  </header>
  <main class="mx-auto max-w-6xl px-6 py-6">
    {@render children?.()}
  </main>
</div>
