<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface DocRow {
    id: string;
    title: string;
    kind: string;
    updated_at: string;
  }

  interface Props {
    docs: DocRow[];
  }

  const { docs }: Props = $props();
</script>

<section data-recent-docs class={cn("space-y-2")}>
  <h3 class={cn("text-sm font-semibold tracking-tight")}>Recent docs</h3>
  {#if docs.length === 0}
    <div data-recent-docs-empty class={cn("text-sm text-muted-foreground")}>
      No recent docs.
    </div>
  {:else}
    <ul class={cn("space-y-1")}>
      {#each docs as doc (doc.id)}
        <li
          data-recent-doc
          data-doc-id={doc.id}
          class={cn("flex items-center gap-2 text-sm")}
        >
          <a href={"/docs/" + doc.id} class={cn("hover:underline font-medium")}>{doc.title}</a>
          <span data-kind class={cn("text-muted-foreground")}>{doc.kind}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
