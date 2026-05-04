<script lang="ts">
  import { cn } from "$lib/utils.js";

  import { filterAndSort, type CommandItem } from "./command-palette-filter";
  import { makeSelect } from "./command-palette-handlers";

  interface Props {
    items: CommandItem[];
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onSelect: (item: CommandItem) => void;
  }

  let { items, open, onOpenChange, onSelect }: Props = $props();
  let query = $state("");

  const filtered = $derived(filterAndSort(items, query));

  function selectItem(item: CommandItem) {
    onSelect(item);
    onOpenChange(false);
  }

  function selectTop() {
    makeSelect(items, query, onSelect, onOpenChange)();
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    selectTop();
  }
</script>

<div data-command-palette data-state={open ? "open" : "closed"}>
  {#if open}
    <div class={cn("fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm")}>
      <div
        class={cn(
          "mx-auto mt-16 max-w-lg overflow-hidden rounded-lg border border-border bg-popover shadow-lg",
        )}
      >
        <input
          data-command-palette-input
          type="text"
          bind:value={query}
          onkeydown={handleInputKeydown}
          class={cn(
            "h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none",
            "placeholder:text-muted-foreground",
          )}
          aria-label="Command search"
          placeholder="Search commands"
        />
        <ul data-command-palette-list class={cn("max-h-72 overflow-y-auto p-1")}>
          {#each filtered as item (item.id)}
            <li data-command-palette-item data-id={item.id}>
              <button
                type="button"
                onclick={() => selectItem(item)}
                class={cn(
                  "flex h-9 w-full items-center rounded-md px-2 text-left text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {item.label}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>
