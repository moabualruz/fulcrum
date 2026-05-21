<script lang="ts">
  import { Chip } from "@fulcrum/ui-kit";

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
  class="contents"
>
  <Chip tone={active ? "accent" : "neutral"} class="cursor-pointer rounded-full">
    {label}
    {#if count !== undefined}
      <span class={active ? "opacity-75" : "text-muted-foreground"}>{count}</span>
    {/if}
  </Chip>
</button>
