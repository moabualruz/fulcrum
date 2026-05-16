<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;

  const doc = data.doc;
  const bodyPreview = doc.bodyMd.length > 500 ? doc.bodyMd.slice(0, 500) + "…" : doc.bodyMd;
</script>

<div class="max-w-2xl mx-auto p-6">
  <h1 class="text-xl font-semibold mb-2">Start Planning from Document</h1>
  <p class="text-sm text-muted-foreground mb-4">
    Use <strong>{doc.title}</strong> as context for a new planning session.
  </p>

  {#if bodyPreview}
    <details class="mb-6 border rounded p-3">
      <summary class="cursor-pointer text-sm font-medium">Document Preview</summary>
      <pre class="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{bodyPreview}</pre>
    </details>
  {/if}

  <form method="POST" action="?/startPlanning">
    {#if doc.projectId}
      <input type="hidden" name="projectId" value={doc.projectId} />
      <p class="text-sm mb-4">
        This document belongs to project <code>{doc.projectId}</code>.
        Planning will start in the project context.
      </p>
    {:else}
      <p class="text-sm mb-4">
        No project linked. Planning will start as a standalone session.
      </p>
    {/if}

    <button
      type="submit"
      class="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
    >
      Start Planning Session
    </button>
    <a href="/docs/{doc.id}" class="ml-3 text-sm text-muted-foreground hover:underline">
      Back to document
    </a>
  </form>
</div>
