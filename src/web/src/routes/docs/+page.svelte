<script lang="ts">
  let { data } = $props();
</script>

<h1 class="text-xl font-semibold mb-4">Documents</h1>

{#if data.documents.length === 0}
  <p class="text-sm text-muted-foreground">No documents indexed.</p>
{:else}
  <ul class="divide-y divide-border">
    {#each data.documents as doc (doc.id)}
      <li class="py-2 flex items-center justify-between">
        <span>{doc.title}</span>
        <span class="flex items-center gap-2">
          <span class="rounded bg-muted px-2 py-0.5 text-xs">{doc.kind}</span>
          <span class="text-xs text-muted-foreground">{doc.updated_at}</span>
        </span>
      </li>
    {/each}
  </ul>
{/if}
