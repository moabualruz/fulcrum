<script lang="ts">
  /**
   * ShortcutHelpOverlay: task workflow (D-68).
   *
   * Opened with the `?` key. Shows all keyboard shortcuts in a
   * two-column grouped layout. Closes on Esc or backdrop click.
   */
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const GROUPS: Array<{ title: string; shortcuts: Array<{ keys: string[]; description: string }> }> = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["j"], description: "Move down" },
        { keys: ["k"], description: "Move up" },
        { keys: ["Enter"], description: "Open task" },
        { keys: ["Esc"], description: "Close / cancel" },
        { keys: ["g", "b"], description: "Board view" },
        { keys: ["g", "l"], description: "List view" },
        { keys: ["g", "g"], description: "Gantt view" },
      ],
    },
    {
      title: "Task Actions",
      shortcuts: [
        { keys: ["c"], description: "Create task" },
        { keys: ["e"], description: "Inline edit" },
        { keys: ["s"], description: "Set status" },
        { keys: ["a"], description: "Set assignee" },
        { keys: ["p"], description: "Set priority" },
        { keys: ["l"], description: "Add label" },
        { keys: ["m"], description: "Move to sprint" },
        { keys: ["Shift", "C"], description: "Add to current sprint" },
        { keys: ["f"], description: "Add filter" },
      ],
    },
    {
      title: "Selection",
      shortcuts: [
        { keys: ["x"], description: "Toggle select" },
      ],
    },
    {
      title: "System",
      shortcuts: [
        { keys: ["⌘", "k"], description: "Command palette" },
        { keys: ["?"], description: "Show shortcuts" },
      ],
    },
  ];

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard shortcuts"
    tabindex="-1"
    data-testid="keyboard-help-overlay"
    class={cn("fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4")}
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div
      class={cn(
        "w-full max-w-2xl rounded-xl border border-border bg-popover shadow-xl",
        "max-h-[80vh] overflow-y-auto",
      )}
    >
      <!-- Header -->
      <div class={cn("flex items-center justify-between border-b border-border px-6 py-4")}>
        <h2 class="text-base font-semibold">Keyboard Shortcuts</h2>
        <button
          type="button"
          onclick={onClose}
          aria-label="Close shortcuts overlay"
          class={cn(
            "rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          ✕
        </button>
      </div>

      <!-- Body: 2-column grid -->
      <div class={cn("grid grid-cols-1 gap-6 p-6 sm:grid-cols-2")}>
        {#each GROUPS as group (group.title)}
          <div>
            <h3 class={cn("mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground")}>
              {group.title}
            </h3>
            <ul class="space-y-2">
              {#each group.shortcuts as shortcut (shortcut.description)}
                <li class="flex items-center justify-between gap-4">
                  <span class="text-sm text-foreground">{shortcut.description}</span>
                  <span class="flex shrink-0 items-center gap-1">
                    {#each shortcut.keys as key, i (`${key}-${i}`)}
                      <kbd
                        class={cn(
                          "inline-flex items-center rounded border border-border bg-muted",
                          "px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
                        )}
                      >
                        {key}
                      </kbd>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
