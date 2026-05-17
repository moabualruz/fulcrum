<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface PreviewTask {
    id?: string;
    title: string;
    status?: string;
    dependencies?: string[];
    labels?: string[];
    priority?: number;
  }

  interface PreviewDoc {
    id?: string;
    title: string;
    kind?: string;
    path?: string;
  }

  interface PreviewArtifact {
    id?: string;
    path: string;
    kind?: string;
    description?: string;
  }

  interface PlanPreview {
    planId: string;
    traceId?: string;
    tasks?: PreviewTask[];
    docs?: PreviewDoc[];
    artifacts?: PreviewArtifact[];
    dependencies?: Array<{ from: string; to: string }>;
    summary?: string;
  }

  interface MaterializedResult {
    planId: string;
    traceId?: string;
    status: string;
    tasksCreated?: number;
    docsCreated?: number;
    artifactsCreated?: number;
    tasks?: Array<{ id: string; title: string }>;
    docs?: Array<{ id: string; title: string }>;
    artifacts?: Array<{ id: string; path: string }>;
  }

  interface Props {
    data: {
      projectId: string;
      defaultPlanId: string;
      defaultTraceId: string;
      preview: PlanPreview | null;
      materialized: MaterializedResult | null;
    };
    form?: {
      ok: boolean;
      mode?: "preview" | "materialize";
      error?: string;
      preview?: PlanPreview;
      materialized?: MaterializedResult;
    };
  }

  let { data, form }: Props = $props();
</script>

<div data-testid="materialize-page">
  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>
        &larr; Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Plan Materialization</h1>
    </div>
  </header>

  <!-- Plan Input -->
  <section data-plan-input class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Approved Plan</h2>
    <form method="POST" action="?/preview" class={cn("grid gap-3 rounded-md border border-border p-4")}>
      <input type="hidden" name="projectId" value={data.projectId} />
      <div class={cn("grid gap-3 sm:grid-cols-2")}>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Plan ID</span>
          <input
            name="planId"
            value={data.defaultPlanId}
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Trace ID</span>
          <input
            name="traceId"
            value={data.defaultTraceId}
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
      </div>
      <label class={cn("grid gap-1 text-sm")}>
        <span class={cn("text-muted-foreground")}>Approved plan markdown</span>
        <textarea
          name="approvedPlanMarkdown"
          rows="10"
          placeholder="Paste the approved plan markdown here..."
          class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
        ></textarea>
      </label>
      <div class={cn("grid gap-3 sm:grid-cols-3")}>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Review ID (optional)</span>
          <input
            name="reviewId"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Cycle ID (optional)</span>
          <input
            name="cycleId"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("text-muted-foreground")}>Source doc refs (optional)</span>
          <input
            name="sourceDocRefs"
            placeholder="kind:id,kind:id"
            class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
          />
        </label>
      </div>
      <div class={cn("flex items-center gap-3")}>
        <button
          type="submit"
          class={cn("h-9 rounded-md border border-border bg-background px-4 text-sm font-medium")}
        >
          Preview Breakdown
        </button>
        <button
          type="submit"
          formaction="?/materialize"
          class={cn("h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground")}
        >
          Materialize
        </button>
      </div>
    </form>
  </section>

  <!-- Preview Result -->
  {#if form?.mode === "preview" && form.ok && form.preview}
    <section data-preview-result class={cn("mb-6 space-y-3")}>
      <h2 class={cn("text-lg font-semibold")}>Preview</h2>
      <div class={cn("rounded-md border border-border p-4 space-y-4")}>
        <div class={cn("grid gap-2 sm:grid-cols-3 text-sm")}>
          <div>
            <span class={cn("text-muted-foreground")}>Plan ID:</span> {form.preview.planId}
          </div>
          <div>
            <span class={cn("text-muted-foreground")}>Trace:</span> {form.preview.traceId ?? "none"}
          </div>
          {#if form.preview.summary}
            <div>
              <span class={cn("text-muted-foreground")}>Summary:</span> {form.preview.summary}
            </div>
          {/if}
        </div>

        {#if form.preview.tasks && form.preview.tasks.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Tasks ({form.preview.tasks.length})</h3>
            <ul class={cn("space-y-2")}>
              {#each form.preview.tasks as task, i (task.id ?? i)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <div class={cn("flex items-center justify-between gap-2")}>
                    <span class={cn("font-medium")}>{task.title}</span>
                    {#if task.status}
                      <span class={cn("rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground")}>
                        {task.status}
                      </span>
                    {/if}
                  </div>
                  {#if task.dependencies && task.dependencies.length > 0}
                    <div class={cn("mt-1 text-xs text-muted-foreground")}>
                      Depends on: {task.dependencies.join(", ")}
                    </div>
                  {/if}
                  {#if task.labels && task.labels.length > 0}
                    <div class={cn("mt-1 flex gap-1")}>
                      {#each task.labels as label}
                        <span class={cn("rounded bg-muted px-1.5 py-0.5 text-xs")}>{label}</span>
                      {/each}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if form.preview.docs && form.preview.docs.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Docs ({form.preview.docs.length})</h3>
            <ul class={cn("space-y-2")}>
              {#each form.preview.docs as doc, i (doc.id ?? i)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <span class={cn("font-medium")}>{doc.title}</span>
                  {#if doc.kind}
                    <span class={cn("ml-2 text-xs text-muted-foreground")}>[{doc.kind}]</span>
                  {/if}
                  {#if doc.path}
                    <div class={cn("text-xs text-muted-foreground")}>{doc.path}</div>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if form.preview.artifacts && form.preview.artifacts.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Artifacts ({form.preview.artifacts.length})</h3>
            <ul class={cn("space-y-2")}>
              {#each form.preview.artifacts as artifact, i (artifact.id ?? i)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <span class={cn("font-medium")}>{artifact.path}</span>
                  {#if artifact.kind}
                    <span class={cn("ml-2 text-xs text-muted-foreground")}>[{artifact.kind}]</span>
                  {/if}
                  {#if artifact.description}
                    <div class={cn("text-xs text-muted-foreground")}>{artifact.description}</div>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if form.preview.dependencies && form.preview.dependencies.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Dependencies ({form.preview.dependencies.length})</h3>
            <ul class={cn("space-y-1 text-sm text-muted-foreground")}>
              {#each form.preview.dependencies as dep, i (i)}
                <li>{dep.from} &rarr; {dep.to}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </section>
  {:else if form?.mode === "preview" && !form?.ok}
    <div data-preview-error class={cn("mb-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
      {form?.error}
    </div>
  {/if}

  <!-- Materialize Result -->
  {#if form?.mode === "materialize" && form.ok && form.materialized}
    <section data-materialize-result class={cn("mb-6 space-y-3")}>
      <h2 class={cn("text-lg font-semibold")}>Materialized</h2>
      <div class={cn("rounded-md border border-border p-4 space-y-4")}>
        <div class={cn("grid gap-2 sm:grid-cols-4 text-sm")}>
          <div>
            <span class={cn("text-xs text-muted-foreground")}>Status</span>
            <div class={cn("font-medium")}>{form.materialized.status}</div>
          </div>
          <div>
            <span class={cn("text-xs text-muted-foreground")}>Tasks Created</span>
            <div class={cn("font-medium")}>{form.materialized.tasksCreated ?? 0}</div>
          </div>
          <div>
            <span class={cn("text-xs text-muted-foreground")}>Docs Created</span>
            <div class={cn("font-medium")}>{form.materialized.docsCreated ?? 0}</div>
          </div>
          <div>
            <span class={cn("text-xs text-muted-foreground")}>Artifacts Created</span>
            <div class={cn("font-medium")}>{form.materialized.artifactsCreated ?? 0}</div>
          </div>
        </div>

        {#if form.materialized.tasks && form.materialized.tasks.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Created Tasks</h3>
            <ul class={cn("space-y-1")}>
              {#each form.materialized.tasks as task (task.id)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <a
                    href="/projects/{data.projectId}/board?search={task.id}"
                    class={cn("font-medium text-primary hover:underline")}
                  >
                    {task.title}
                  </a>
                  <span class={cn("ml-2 text-xs text-muted-foreground")}>{task.id}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if form.materialized.docs && form.materialized.docs.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Created Docs</h3>
            <ul class={cn("space-y-1")}>
              {#each form.materialized.docs as doc (doc.id)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <span class={cn("font-medium")}>{doc.title}</span>
                  <span class={cn("ml-2 text-xs text-muted-foreground")}>{doc.id}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if form.materialized.artifacts && form.materialized.artifacts.length > 0}
          <div>
            <h3 class={cn("mb-2 text-sm font-semibold")}>Created Artifacts</h3>
            <ul class={cn("space-y-1")}>
              {#each form.materialized.artifacts as artifact (artifact.id)}
                <li class={cn("rounded border border-border px-3 py-2 text-sm")}>
                  <span class={cn("font-medium")}>{artifact.path}</span>
                  <span class={cn("ml-2 text-xs text-muted-foreground")}>{artifact.id}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class={cn("text-sm text-muted-foreground")}>
          <a
            href="/projects/{data.projectId}/board"
            class={cn("text-primary hover:underline")}
          >
            Go to board &rarr;
          </a>
        </div>
      </div>
    </section>
  {:else if form?.mode === "materialize" && !form?.ok}
    <div data-materialize-error class={cn("mb-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
      {form?.error}
    </div>
  {/if}
</div>
