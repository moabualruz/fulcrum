<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    label: string;
    value: number | string;
    href?: string;
  }

  const { label, value, href }: Props = $props();

  const cardClass = cn(
    "block rounded-lg border border-border bg-card p-4 shadow-xs",
    "hover:bg-accent/50 transition-colors",
  );
</script>

{#if href !== undefined}
  <a data-metric-card data-metric-label={label} href={href} class={cardClass}>
    <div data-metric-value class={cn("text-2xl font-bold tabular-nums")}>{value}</div>
    <div data-metric-label-text class={cn("text-sm text-muted-foreground mt-1")}>{label}</div>
  </a>
{:else}
  <div data-metric-card data-metric-label={label} class={cardClass}>
    <div data-metric-value class={cn("text-2xl font-bold tabular-nums")}>{value}</div>
    <div data-metric-label-text class={cn("text-sm text-muted-foreground mt-1")}>{label}</div>
  </div>
{/if}
