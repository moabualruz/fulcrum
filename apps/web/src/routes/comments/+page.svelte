<script lang="ts">
  import { onMount } from "svelte";
  import { cn, Select } from "@fulcrum/ui-kit";

  type SaveState = "saved" | "saving";

  interface PropertyOption {
    label: string;
    value: string;
  }

  interface TaskComment {
    id: string;
    author: string;
    role: string;
    body: string;
    age: string;
  }

  interface ActivityEvent {
    id: string;
    actor: string;
    action: string;
    detail: string;
    age: string;
  }

  interface RelatedItem {
    id: string;
    label: string;
    state: string;
  }

  const STATE_OPTIONS: PropertyOption[] = [
    { label: "Backlog", value: "backlog" },
    { label: "Todo", value: "todo" },
    { label: "In Progress", value: "in-progress" },
    { label: "In Review", value: "in-review" },
    { label: "Done", value: "done" },
  ];
  const PRIORITY_OPTIONS: PropertyOption[] = [
    { label: "Urgent", value: "urgent" },
    { label: "High", value: "high" },
    { label: "Medium", value: "medium" },
    { label: "Low", value: "low" },
  ];
  const ASSIGNEE_OPTIONS: PropertyOption[] = [
    { label: "Maya", value: "maya" },
    { label: "Omar", value: "omar" },
    { label: "Ada", value: "ada" },
  ];
  const SPRINT_OPTIONS: PropertyOption[] = [
    { label: "Cycle 14", value: "cycle-14" },
    { label: "Cycle 15", value: "cycle-15" },
    { label: "No cycle", value: "none" },
  ];
  const MODULE_OPTIONS: PropertyOption[] = [
    { label: "Quality", value: "quality" },
    { label: "Runs", value: "runs" },
    { label: "Docs", value: "docs" },
  ];
  const LABELS = ["qa", "blocked-risk", "release"];

  const COMMENTS: TaskComment[] = [
    {
      id: "comment-1",
      author: "Maya",
      role: "QA",
      body: "Acceptance needs one more run artifact before this leaves review.",
      age: "6 min ago",
    },
    {
      id: "comment-2",
      author: "Omar",
      role: "Engineer",
      body: "Linked the failed run and added the dependency chain below.",
      age: "18 min ago",
    },
  ];
  const ACTIVITY: ActivityEvent[] = [
    { id: "event-1", actor: "Ada", action: "moved state", detail: "Todo -> In Review", age: "2 min ago" },
    { id: "event-2", actor: "Maya", action: "changed priority", detail: "High -> Urgent", age: "14 min ago" },
    { id: "event-3", actor: "Fulcrum", action: "attached run", detail: "run-784 evidence bundle", age: "21 min ago" },
  ];
  const RELATED: RelatedItem[] = [
    { id: "FUL-125", label: "Seed activity event fixture", state: "Done" },
    { id: "FUL-131", label: "Review failed QA replay", state: "Blocked" },
  ];
  const RUNS: RelatedItem[] = [
    { id: "run-784", label: "Codex QA replay", state: "Needs approval" },
    { id: "run-786", label: "Design e2e screenshot sweep", state: "Passed" },
  ];

  let title = $state("FUL-132 Validate task detail evidence before release");
  let titleEditing = $state(false);
  let titleSaveState = $state<SaveState>("saved");
  let description = $state("Review QA comments, linked runs, and dependencies without losing board context.");
  let descriptionSaveState = $state<SaveState>("saved");
  let state = $state("in-review");
  let priority = $state("urgent");
  let assignee = $state("maya");
  let sprint = $state("cycle-14");
  let module = $state("quality");
  let activeTab = $state<"comments" | "activity">("comments");
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrated = $state(false);

  const selectedState = $derived(STATE_OPTIONS.find((option) => option.value === state)?.label ?? "Unknown");
  const selectedPriority = $derived(PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? "Unknown");
  const selectedAssignee = $derived(ASSIGNEE_OPTIONS.find((option) => option.value === assignee)?.label ?? "Unassigned");
  const selectedSprint = $derived(SPRINT_OPTIONS.find((option) => option.value === sprint)?.label ?? "No cycle");
  const selectedModule = $derived(MODULE_OPTIONS.find((option) => option.value === module)?.label ?? "No module");

  onMount(() => {
    hydrated = true;
  });

  function debounceSave(kind: "title" | "description"): void {
    if (saveTimer) clearTimeout(saveTimer);
    if (kind === "title") titleSaveState = "saving";
    else descriptionSaveState = "saving";
    saveTimer = setTimeout(() => {
      if (kind === "title") titleSaveState = "saved";
      else descriptionSaveState = "saved";
    }, 450);
  }

  function startTitleEdit(): void {
    titleEditing = true;
    queueMicrotask(() => {
      const input = document.querySelector<HTMLInputElement>("[data-task-title-input]");
      input?.focus();
      input?.select();
    });
  }
</script>

<svelte:head>
  <title>Task detail panel</title>
</svelte:head>

<main data-comments-page data-hydrated={hydrated} class={cn("min-h-screen overflow-x-hidden bg-muted/35 text-foreground")}>
  <div class={cn("mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-6")}>
    <section class={cn("min-w-0 space-y-4")}>
      <header data-comments-header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
        <div class={cn("min-w-0")}>
          <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Build · Task detail</p>
          <h1 class={cn("text-2xl font-semibold tracking-normal")}>Task context panel</h1>
        </div>
        <div class={cn("flex flex-wrap gap-2 text-xs")}>
          <span data-title-save-state class={cn("rounded-full border border-border bg-background px-3 py-1")}>Title {titleSaveState}</span>
          <span data-description-save-state class={cn("rounded-full border border-border bg-background px-3 py-1")}>Description {descriptionSaveState}</span>
        </div>
      </header>

      <div class={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4")}>
        <article data-related-task="FUL-125" class={cn("rounded-md border border-border bg-background p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Blocks</p>
          <h2 class={cn("mt-1 text-sm font-medium")}>Release sign-off</h2>
          <p class={cn("mt-2 text-xs text-muted-foreground")}>Waiting on QA evidence.</p>
        </article>
        <article data-related-task="FUL-131" class={cn("rounded-md border border-border bg-background p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Blocked by</p>
          <h2 class={cn("mt-1 text-sm font-medium")}>Replay failed run</h2>
          <p class={cn("mt-2 text-xs text-muted-foreground")}>Needs approval decision.</p>
        </article>
        <article data-linked-run="run-784" class={cn("rounded-md border border-border bg-background p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Latest run</p>
          <h2 class={cn("mt-1 text-sm font-medium")}>Codex QA replay</h2>
          <p class={cn("mt-2 text-xs text-muted-foreground")}>2 risky actions queued.</p>
        </article>
        <article data-linked-doc="qa-checklist" class={cn("rounded-md border border-border bg-background p-3")}>
          <p class={cn("text-xs text-muted-foreground")}>Doc</p>
          <h2 class={cn("mt-1 text-sm font-medium")}>QA checklist</h2>
          <p class={cn("mt-2 text-xs text-muted-foreground")}>Criteria, notes, artifacts.</p>
        </article>
      </div>
    </section>

    <aside data-task-detail-panel class={cn("min-w-0 rounded-md border border-border bg-background shadow-sm lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto")}>
      <div class={cn("border-b border-border p-3")}>
        <div class={cn("mb-3 flex items-center justify-between gap-2")}>
          <button data-close-panel class={cn("h-8 rounded-md border border-input px-3 text-sm hover:bg-muted")} aria-label="Close task detail panel">Close</button>
          <a data-open-full-page href="/tasks/FUL-132" class={cn("rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted")}>Open full page</a>
        </div>

        <div class={cn("space-y-2")}>
          <div class={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground")}>
            <span data-task-key class={cn("rounded bg-muted px-2 py-1 font-mono")}>FUL-132</span>
            <span data-current-state>{selectedState}</span>
            <span>·</span>
            <span data-current-priority>{selectedPriority}</span>
          </div>
          {#if titleEditing}
            <input
              data-testid="task-title"
              data-task-title-input
              bind:value={title}
              oninput={() => debounceSave("title")}
              onblur={() => (titleEditing = false)}
              class={cn("w-full rounded-md border border-input bg-background px-2 py-1 text-xl font-semibold")}
            />
          {:else}
            <button
              data-testid="task-title"
              data-task-title
              class={cn("block w-full text-left text-xl font-semibold leading-tight hover:text-muted-foreground")}
              onclick={startTitleEdit}
            >
              {title}
            </button>
          {/if}
        </div>
      </div>

      <section data-task-description class={cn("border-b border-border p-3")}>
        <div class={cn("mb-2 flex items-center justify-between gap-2")}>
          <h2 class={cn("text-sm font-semibold")}>Description</h2>
          <span data-description-saving class={cn("text-xs text-muted-foreground")}>{descriptionSaveState}</span>
        </div>
        <textarea
          data-task-description-input
          bind:value={description}
          oninput={() => debounceSave("description")}
          class={cn("min-h-28 w-full resize-y rounded-md border border-input bg-background p-2 text-sm")}
        ></textarea>
      </section>

      <section data-task-properties class={cn("border-b border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Properties</h2>
        <div class={cn("mt-3 grid gap-2 sm:grid-cols-2")}>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            State
            <select data-property-state bind:value={state} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              {#each STATE_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Priority
            <select data-property-priority bind:value={priority} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              {#each PRIORITY_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Assignee
            <select data-property-assignee bind:value={assignee} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              {#each ASSIGNEE_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Sprint
            <select data-property-sprint bind:value={sprint} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              {#each SPRINT_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Module
            <select data-property-module bind:value={module} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              {#each MODULE_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <div class={cn("text-xs font-medium text-muted-foreground")}>
            Labels
            <div data-task-labels class={cn("mt-1 flex flex-wrap gap-1")}>
              {#each LABELS as label (label)}
                <span class={cn("rounded bg-muted px-2 py-1 text-[11px] text-foreground")}>{label}</span>
              {/each}
            </div>
          </div>
        </div>
        <div data-property-summary class={cn("mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground")}>
          {selectedAssignee} owns {selectedSprint} · {selectedModule}
        </div>
      </section>

      <section data-task-relations class={cn("border-b border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Related tasks and runs</h2>
        <div class={cn("mt-3 grid gap-3 sm:grid-cols-2")}>
          <div class={cn("space-y-2")}>
            {#each RELATED as item (item.id)}
              <div data-related-item={item.id} class={cn("rounded-md border border-border p-2 text-xs")}>
                <div class={cn("font-medium")}>{item.id}</div>
                <div>{item.label}</div>
                <div class={cn("mt-1 text-muted-foreground")}>{item.state}</div>
              </div>
            {/each}
          </div>
          <div class={cn("space-y-2")}>
            {#each RUNS as run (run.id)}
              <div data-run-item={run.id} class={cn("rounded-md border border-border p-2 text-xs")}>
                <div class={cn("font-medium")}>{run.id}</div>
                <div>{run.label}</div>
                <div class={cn("mt-1 text-muted-foreground")}>{run.state}</div>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <section data-task-comments-activity class={cn("p-3")}>
        <div class={cn("flex gap-2 border-b border-border pb-2")}>
          <button data-comments-tab aria-pressed={activeTab === "comments"} onclick={() => (activeTab = "comments")} class={cn("rounded-md px-3 py-1.5 text-sm", activeTab === "comments" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Comments</button>
          <button data-activity-tab aria-pressed={activeTab === "activity"} onclick={() => (activeTab = "activity")} class={cn("rounded-md px-3 py-1.5 text-sm", activeTab === "activity" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Activity</button>
        </div>

        {#if activeTab === "comments"}
          <div data-comments-thread class={cn("mt-3 space-y-3")}>
            {#each COMMENTS as comment (comment.id)}
              <article data-comment={comment.id} class={cn("rounded-md border border-border p-3 text-sm")}>
                <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
                  <span class={cn("font-medium")}>{comment.author} · {comment.role}</span>
                  <span class={cn("text-xs text-muted-foreground")}>{comment.age}</span>
                </div>
                <p class={cn("mt-2 text-muted-foreground")}>{comment.body}</p>
              </article>
            {/each}
            <label class={cn("block text-xs font-medium text-muted-foreground")}>
              Add comment
              <textarea data-add-comment class={cn("mt-1 min-h-20 w-full resize-y rounded-md border border-input bg-background p-2 text-sm")} placeholder="Ask for evidence, link a run, or note a field change"></textarea>
            </label>
          </div>
        {:else}
          <ol data-activity-log class={cn("mt-3 space-y-3")}>
            {#each ACTIVITY as event (event.id)}
              <li data-activity-event={event.id} class={cn("rounded-md border border-border p-3 text-sm")}>
                <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
                  <span><strong>{event.actor}</strong> {event.action}</span>
                  <span class={cn("text-xs text-muted-foreground")}>{event.age}</span>
                </div>
                <p class={cn("mt-1 text-muted-foreground")}>{event.detail}</p>
              </li>
            {/each}
          </ol>
        {/if}
      </section>
    </aside>
  </div>
</main>
