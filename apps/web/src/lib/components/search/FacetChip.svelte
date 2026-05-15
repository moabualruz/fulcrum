<script lang="ts">
  /**
   * Badge-style chip for active/inactive filter facets.
   * Active: --primary fill. Inactive: --secondary fill.
   */

  interface Props {
    label: string;
    count?: number;
    active?: boolean;
    onClick?: () => void;
  }

  let { label, count, active = false, onClick }: Props = $props();
</script>

<button
  data-facet-chip
  data-facet-active={active}
  type="button"
  onclick={onClick}
  class={[
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-secondary text-secondary-foreground hover:bg-primary/10",
  ].join(" ")}
>
  {label}
  {#if count !== undefined}
    <span class={active ? "opacity-75" : "text-muted-foreground"}>{count}</span>
  {/if}
</button>
