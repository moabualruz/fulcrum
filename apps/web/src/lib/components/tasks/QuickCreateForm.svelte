<script lang="ts">
  /**
   * QuickCreateForm: task workflow (D-113).
   *
   * Compact floating form for rapid task creation.
   * Triggered by the `c` keyboard shortcut or a + button.
   * Enter submits, Esc closes. Stays open after submit for multi-create.
   *
   */
  import { cn } from "@fulcrum/ui-kit";
  import { page } from "$app/state";
  import {
    createQuickTask,
    findSimilarTasks,
    listProjectTemplates,
  } from "./quick-create-api";

  interface Template {
    id: string;
    name: string;
    templateData?: Record<string, unknown>;
    template_data?: Record<string, unknown>;
  }

  interface DuplicateTask {
    id: string;
    title: string;
    identifier?: string;
    projectId: string;
  }

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Pre-fill project from route context. Defaults to activeProjectId from layout. */
    projectId?: string;
    orgId?: string;
    currentUserId?: string;
    /** Pre-fill status (e.g. when triggered from a board column). */
    defaultStatus?: string;
    /** Pre-fill sprint id (e.g. when viewing a sprint). */
    defaultSprintId?: string;
    /** Pre-fill assignee id. */
    defaultAssigneeId?: string;
  }

  let {
    open,
    onClose,
    projectId: propProjectId,
    orgId = "",
    currentUserId = "",
    defaultStatus,
    defaultSprintId,
    defaultAssigneeId,
  }: Props = $props();

  // Derive projectId from prop or current route param
  const projectId = $derived(
    propProjectId ?? (page.params?.projectId as string | undefined) ?? ""
  );

  let title = $state("");
  let type = $state<"epic" | "task" | "subtask" | "bug">("task");
  let assigneeId = $state(defaultAssigneeId ?? "");
  let priority = $state<"urgent" | "high" | "medium" | "low" | "none">("none");
  let labels = $state<string[]>([]);
  let showMore = $state(false);
  let dueDate = $state("");
  let estimation = $state<number | null>(null);
  let description = $state("");
  let submitting = $state(false);
  let submitError = $state("");

  // Duplicate detection
  let duplicates = $state<DuplicateTask[]>([]);
  let duplicatesDismissed = $state(false);
  let dupeDebounce: ReturnType<typeof setTimeout> | null = null;

  function checkDuplicates() {
    if (dupeDebounce) clearTimeout(dupeDebounce);
    if (!title.trim() || !projectId) return;
    duplicatesDismissed = false;
    dupeDebounce = setTimeout(async () => {
      try {
        duplicates = await findSimilarTasks(fetch, {
          orgId,
          userId: currentUserId,
          projectId,
          title: title.trim(),
        });
      } catch {
        // silently ignore: duplicate detection is best-effort
      }
    }, 500);
  }

  // Template picker
  let templates = $state<Template[]>([]);
  let templateOpen = $state(false);

  async function loadTemplates() {
    if (templates.length > 0) return;
    try {
      templates = await listProjectTemplates(fetch, { orgId, userId: currentUserId, projectId });
    } catch { /* best-effort */ }
  }

  function applyTemplate(tmpl: Template) {
    const d = tmpl.templateData ?? tmpl.template_data ?? {};
    if (typeof d.title === "string") title = d.title;
    if (typeof d.type === "string") type = d.type as typeof type;
    if (typeof d.priority === "string") priority = d.priority as typeof priority;
    if (typeof d.description === "string") description = d.description;
    templateOpen = false;
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (!title.trim() || !projectId) return;
    submitting = true;
    submitError = "";
    try {
      await createQuickTask(fetch, {
        orgId,
        userId: currentUserId,
        projectId,
        title: title.trim(),
        status: defaultStatus ?? "todo",
        ...(assigneeId ? { assigneeId } : {}),
        ...(priority !== "none" ? { priority: priorityValue(priority) } : {}),
        ...(showMore && estimation != null ? { points: estimation } : {}),
        ...(showMore && description ? { description } : {}),
      });
      // Linear behavior: stay open for rapid multi-create
      title = "";
      duplicates = [];
      duplicatesDismissed = false;
      assigneeId = defaultAssigneeId ?? "";
      priority = "none";
      labels = [];
      dueDate = "";
      estimation = null;
      description = "";
    } catch {
      submitError = "Network error. Please retry.";
    } finally {
      submitting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  const TYPES = ["epic", "task", "subtask", "bug"] as const;
  const PRIORITIES = [
    { value: "none", label: "No priority" },
    { value: "urgent", label: "Urgent" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ] as const;

  function priorityValue(value: typeof priority): number {
    if (value === "urgent") return 4;
    if (value === "high") return 3;
    if (value === "medium") return 2;
    if (value === "low") return 1;
    return 0;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class={cn("fixed inset-0 z-40 flex items-end justify-center pb-8 px-4")}
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
    aria-hidden="true"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class={cn(
        "w-full max-w-lg rounded-xl border border-border bg-popover shadow-2xl",
        "animate-in slide-in-from-bottom-4 duration-200",
      )}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Create task"
    >
      <form onsubmit={handleSubmit} class="flex flex-col gap-0">
        <!-- Title input -->
        <div class="relative px-4 pt-4">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            autofocus
            type="text"
            bind:value={title}
            onblur={checkDuplicates}
            placeholder="Task title..."
            aria-label="Task title"
            required
            class={cn(
              "w-full bg-transparent text-base font-medium outline-none",
              "placeholder:text-muted-foreground",
            )}
          />

          <!-- Duplicate detection -->
          {#if duplicates.length > 0 && !duplicatesDismissed}
            <div
              class={cn(
                "mt-2 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs",
                "dark:border-yellow-800 dark:bg-yellow-950",
              )}
              role="alert"
              aria-live="polite"
            >
              <div class="mb-1 font-medium text-yellow-800 dark:text-yellow-200">
                Possible duplicates:
              </div>
              <ul class="space-y-0.5">
                {#each duplicates.slice(0, 3) as dup (dup.id)}
                  <li>
                    <a
                      href={`/projects/${dup.projectId}/tasks/${dup.id}`}
                      class="text-yellow-700 underline dark:text-yellow-300"
                    >
                      {dup.identifier ? `${dup.identifier} ` : ""}{dup.title}
                    </a>
                  </li>
                {/each}
              </ul>
              <button
                type="button"
                class="mt-1 text-yellow-600 underline dark:text-yellow-400"
                onclick={() => { duplicatesDismissed = true; }}
              >Dismiss</button>
            </div>
          {/if}
        </div>

        <!-- Field row -->
        <div class={cn("flex flex-wrap items-center gap-2 px-4 py-3")}>
          <!-- Type -->
          <select
            bind:value={type}
            aria-label="Task type"
            class={cn(
              "rounded border border-border bg-background px-2 py-1 text-xs",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          >
            {#each TYPES as t (t)}
              <option value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            {/each}
          </select>

          <!-- Priority -->
          <select
            bind:value={priority}
            aria-label="Priority"
            class={cn(
              "rounded border border-border bg-background px-2 py-1 text-xs",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          >
            {#each PRIORITIES as p (p.value)}
              <option value={p.value}>{p.label}</option>
            {/each}
          </select>

          <!-- Template button -->
          <div class="relative">
            <button
              type="button"
              onclick={() => { templateOpen = !templateOpen; if (templateOpen) void loadTemplates(); }}
              class={cn(
                "rounded border border-border bg-background px-2 py-1 text-xs",
                "hover:bg-accent",
              )}
            >
              Use template
            </button>
            {#if templateOpen && templates.length > 0}
              <div class={cn(
                "absolute bottom-8 left-0 z-10 w-48 rounded-md border border-border bg-popover shadow-md",
              )}>
                {#each templates as tmpl (tmpl.id)}
                  <button
                    type="button"
                    onclick={() => applyTemplate(tmpl)}
                    class={cn(
                      "w-full px-3 py-2 text-left text-xs hover:bg-accent",
                    )}
                  >
                    {tmpl.name}
                  </button>
                {/each}
              </div>
            {:else if templateOpen && templates.length === 0}
              <div class="absolute bottom-8 left-0 z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
                No templates
              </div>
            {/if}
          </div>

          <!-- More fields toggle -->
          <button
            type="button"
            onclick={() => { showMore = !showMore; }}
            class={cn("ml-auto text-xs text-muted-foreground hover:text-foreground")}
          >
            {showMore ? "Less" : "More fields"}
          </button>
        </div>

        <!-- Expanded fields -->
        {#if showMore}
          <div class={cn("flex flex-col gap-2 border-t border-border px-4 py-3")}>
            <div class="flex items-center gap-2">
              <label for="qcf-due-date" class="w-20 shrink-0 text-xs text-muted-foreground">Due date</label>
              <input
                id="qcf-due-date"
                type="date"
                bind:value={dueDate}
                class={cn(
                  "flex-1 rounded border border-border bg-background px-2 py-1 text-xs",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                )}
              />
            </div>
            <div class="flex items-center gap-2">
              <label for="qcf-points" class="w-20 shrink-0 text-xs text-muted-foreground">Points</label>
              <input
                id="qcf-points"
                type="number"
                min="0"
                max="999"
                bind:value={estimation}
                class={cn(
                  "flex-1 rounded border border-border bg-background px-2 py-1 text-xs",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                )}
              />
            </div>
            <div class="flex items-start gap-2">
              <label for="qcf-desc" class="mt-1 w-20 shrink-0 text-xs text-muted-foreground">Description</label>
              <textarea
                id="qcf-desc"
                bind:value={description}
                rows={3}
                class={cn(
                  "flex-1 rounded border border-border bg-background px-2 py-1 text-xs",
                  "resize-none focus:outline-none focus:ring-1 focus:ring-ring",
                )}
              ></textarea>
            </div>
          </div>
        {/if}

        <!-- Footer actions -->
        <div class={cn("flex items-center justify-between border-t border-border px-4 py-3")}>
          {#if submitError}
            <p class="text-xs text-destructive" role="alert">{submitError}</p>
          {:else}
            <span class="text-xs text-muted-foreground">Enter to create · Esc to close</span>
          {/if}
          <div class="flex gap-2">
            <button
              type="button"
              onclick={onClose}
              class={cn(
                "rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent",
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              class={cn(
                "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
                "hover:bg-primary/90 disabled:opacity-50",
              )}
            >
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
