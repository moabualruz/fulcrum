<script lang="ts">
  type AcpSession = {
    acpSessionId?: string;
    projectId?: string;
    traceId?: string;
    agentName?: string;
    cwd?: string;
    modeId?: string;
    modelId?: string;
    permissionMode?: string;
    sessionStatus?: string;
  };

  type FreeformDocument = {
    id?: string;
    title?: string;
  };

  type ActionForm = {
    ok?: boolean;
    mode?: "guidedAcpStart" | "freeformStart";
    error?: string;
    guidedAcpStart?: {
      status?: string;
      session?: AcpSession;
      permissionOptions?: Array<{ optionId?: string; name?: string }>;
      prompt?: string;
    };
    freeformStart?: {
      status?: string;
      document?: FreeformDocument;
      prompt?: string;
    };
  } | null;

  type Props = {
    data: {
      defaultProjectId: string | null;
      defaultTraceId: string;
      defaultAcpSessionId: string;
    };
    form?: ActionForm;
  };

  let { data, form = null }: Props = $props();

  let guidedAcpStart = $derived(form?.guidedAcpStart ?? null);
  let freeformStart = $derived(form?.freeformStart ?? null);
</script>

<svelte:head>
  <title>ACP Sessions</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" data-sessions-page>
  <header class="flex items-baseline gap-3 border-b border-border pb-4">
    <a href="/planning" class="text-sm text-muted-foreground hover:underline">&larr; Planning</a>
    <h1 class="text-2xl font-semibold tracking-tight text-foreground">ACP Sessions</h1>
  </header>

  {#if form?.ok === false}
    <p class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-sessions-error>
      {form.error}
    </p>
  {/if}

  <!-- Start Guided ACP Session -->
  <section data-guided-session-form class="space-y-3">
    <h2 class="text-lg font-semibold text-foreground">Start Guided Session</h2>
    <form method="POST" action="?/guidedAcpStart" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="flex flex-col gap-3">
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Agent
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpAgentName" value="codex" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Working directory
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpCwd" value="/Users/mkh/workspace/fulcrum" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Prompt
          <textarea
            class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
            name="acpUserPrompt"
          >Plan with selected context through ACP.</textarea>
        </label>
        <button
          type="submit"
          class="inline-flex h-10 w-max items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Start Guided Session
        </button>
      </div>

      <aside class="grid h-max gap-3 rounded-md border border-border p-4">
        <label class="grid gap-1 text-sm font-medium text-foreground">
          ACP session ID
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpSessionId" value={data.defaultAcpSessionId} />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Project ID
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" value={data.defaultProjectId ?? ""} />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Trace ID
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Mode
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modeId" value="planning" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Model
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modelId" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Permissions
          <select class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpPermissionMode">
            <option value="review_each_tool">Review each tool</option>
            <option value="allow_workspace">Allow workspace</option>
            <option value="read_only">Read only</option>
          </select>
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Selected docs
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="selectedDocIds" placeholder="doc-id,doc-id" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Max chars
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
        </label>
      </aside>
    </form>
  </section>

  <!-- Start Freeform Session -->
  <section data-freeform-session-form class="space-y-3 border-t border-border pt-4">
    <h2 class="text-lg font-semibold text-foreground">Start Freeform Session</h2>
    <form method="POST" action="?/freeformStart" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="flex flex-col gap-3">
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Title
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="freeformTitle" value="New work brief" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Document body
          <textarea
            class="min-h-36 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
            name="freeformBodyMd"
          >Capture goals, constraints, and success criteria.</textarea>
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Prompt
          <textarea
            class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
            name="freeformUserPrompt"
          >Plan from this freeform document and produce a prototype-first implementation plan.</textarea>
        </label>
        <button
          type="submit"
          class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        >
          Start Freeform
        </button>
      </div>

      <aside class="grid h-max gap-3 rounded-md border border-border p-4">
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Project ID
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" value={data.defaultProjectId ?? ""} />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Parent doc
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="parentId" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Trace ID
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          ACP session
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpSessionId" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Mode
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modeId" value="planning" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Model
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modelId" />
        </label>
        <label class="grid gap-1 text-sm font-medium text-foreground">
          Max chars
          <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
        </label>
      </aside>
    </form>
  </section>

  <!-- Session Results -->
  {#if guidedAcpStart}
    <section class="grid gap-3 border-t border-border pt-4" data-guided-session-result>
      <h2 class="text-lg font-semibold text-foreground">Guided ACP Session Started</h2>
      <div class="grid gap-2 rounded-md border border-border p-4 text-sm text-foreground sm:grid-cols-3">
        <div>
          <div class="text-xs text-muted-foreground">Session ID</div>
          <div class="font-medium">{guidedAcpStart.session?.acpSessionId ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Status</div>
          <div class="font-medium">{guidedAcpStart.status ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Agent</div>
          <div class="font-medium">{guidedAcpStart.session?.agentName ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Mode</div>
          <div class="font-medium">{guidedAcpStart.session?.modeId ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Model</div>
          <div class="font-medium">{guidedAcpStart.session?.modelId ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Permissions</div>
          <div class="font-medium">{guidedAcpStart.session?.permissionMode ?? "-"}</div>
        </div>
      </div>
      {#if guidedAcpStart.prompt}
        <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{guidedAcpStart.prompt}</pre>
      {/if}
    </section>
  {/if}

  {#if freeformStart}
    <section class="grid gap-3 border-t border-border pt-4" data-freeform-session-result>
      <h2 class="text-lg font-semibold text-foreground">Freeform Session Started</h2>
      <div class="grid gap-2 rounded-md border border-border p-4 text-sm text-foreground sm:grid-cols-3">
        <div>
          <div class="text-xs text-muted-foreground">Status</div>
          <div class="font-medium">{freeformStart.status ?? "-"}</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Document</div>
          <div class="font-medium">{freeformStart.document?.title ?? freeformStart.document?.id ?? "-"}</div>
        </div>
      </div>
      {#if freeformStart.prompt}
        <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{freeformStart.prompt}</pre>
      {/if}
    </section>
  {/if}
</main>
