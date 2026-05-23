<script lang="ts">
  import { Card, Stat } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    label: string;
    value: number | string;
    href?: string;
  }

  const { label, value, href }: Props = $props();

  const cardClass = cn("block transition-colors hover:bg-accent/50");
</script>

{#if href !== undefined}
  <a data-metric-card data-metric-label={label} href={href} aria-label="{label}: {value}" class={cardClass}>
    <Card size="sm">
      <Stat label={label} value={String(value)} />
    </Card>
  </a>
{:else}
  <Card data-metric-card data-metric-label={label} size="sm" class={cardClass}>
    <Stat label={label} value={String(value)} />
  </Card>
{/if}
