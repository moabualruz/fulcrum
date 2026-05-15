<script lang="ts">
  /**
   * MentionSuggestion — dual-source mention popup (users + teams).
   */

  interface Props {
    items: MentionItem[];
    command: (item: MentionItem) => void;
    selectedIndex?: number;
  }

  export interface MentionItem {
    id: string;
    type: "user" | "team";
    label: string;
    avatarUrl?: string;
    email?: string;
  }

  const { items, command, selectedIndex = 0 }: Props = $props();

  function selectItem(item: MentionItem): void {
    command(item);
  }
</script>

<div class="mention-suggestion" role="listbox" aria-label="Mention suggestions">
  {#if items.length === 0}
    <div class="mention-suggestion__empty">No matches found.</div>
  {:else}
    {#each items as item, index (item.id + item.type)}
      <button
        class="mention-suggestion__item"
        class:selected={index === selectedIndex}
        role="option"
        aria-selected={index === selectedIndex}
        onclick={() => selectItem(item)}
        type="button"
      >
        <span class="mention-suggestion__icon" aria-hidden="true">
          {#if item.type === "team"}
            <!-- group icon -->
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          {:else if item.avatarUrl}
            <img src={item.avatarUrl} alt={item.label} width="16" height="16" class="mention-suggestion__avatar" />
          {:else}
            <!-- person icon -->
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          {/if}
        </span>
        <span class="mention-suggestion__name">{item.label}</span>
        {#if item.type === "team"}
          <span class="mention-suggestion__badge">Team</span>
        {:else if item.email}
          <span class="mention-suggestion__email">{item.email}</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .mention-suggestion {
    background: hsl(var(--popover, 0 0% 100%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    max-height: 200px;
    min-width: 200px;
    overflow-y: auto;
    padding: 0.25rem;
    z-index: 100;
  }

  .mention-suggestion__empty {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    text-align: center;
  }

  .mention-suggestion__item {
    align-items: center;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    display: flex;
    font-size: 0.875rem;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    text-align: left;
    width: 100%;
  }

  .mention-suggestion__item:hover,
  .mention-suggestion__item.selected {
    background: hsl(var(--accent, 210 40% 96%));
  }

  .mention-suggestion__icon {
    align-items: center;
    color: hsl(var(--muted-foreground, 215 16% 47%));
    display: flex;
    flex-shrink: 0;
  }

  .mention-suggestion__avatar {
    border-radius: 50%;
    object-fit: cover;
  }

  .mention-suggestion__name {
    flex: 1;
    font-weight: 500;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mention-suggestion__badge {
    background: hsl(var(--secondary, 210 40% 96%));
    border-radius: 0.25rem;
    color: hsl(var(--secondary-foreground, 222 47% 11%));
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.0625rem 0.375rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mention-suggestion__email {
    color: hsl(var(--muted-foreground, 215 16% 47%));
    font-size: 0.75rem;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
