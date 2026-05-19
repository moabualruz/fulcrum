<script lang="ts">
  import { Alert, Badge, Button, FormField, Textarea } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type VersionId = "v4" | "v3" | "v2";

  interface VersionEntry {
    id: VersionId;
    label: string;
    author: string;
    time: string;
    summary: string;
    added: string;
    removed: string;
  }

  interface CommentEntry {
    id: string;
    author: string;
    body: string;
    state: "open" | "resolved";
  }

  const versions: VersionEntry[] = [
    {
      id: "v4",
      label: "Version 4",
      author: "Mira Patel",
      time: "Today 09:42",
      summary: "Added planning conversion notes and linked the capture brief.",
      added: "+ Hand off accepted constraints to Plan with prototype and trace.",
      removed: "- Draft planning notes pending PM review.",
    },
    {
      id: "v3",
      label: "Version 3",
      author: "Noor Haddad",
      time: "Yesterday 17:10",
      summary: "Resolved stale API assumptions and added doc backlinks.",
      added: "+ Backlinks: Sprint 18, Capture intake, Run 01HXYZ.",
      removed: "- API surface TBD.",
    },
    {
      id: "v2",
      label: "Version 2",
      author: "Ari Kim",
      time: "May 16 14:25",
      summary: "Initial product workflow outline.",
      added: "+ Define capture, plan, build, review, ship flow.",
      removed: "- Untitled outline.",
    },
  ];

  const backlinks = [
    { label: "Sprint 18 planning", source: "Plan review", href: "/docs/mock-doc/planning" },
    { label: "Capture intake brief", source: "Capture draft", href: "/mobile-capture" },
    { label: "Run 01HXYZ artifact", source: "Build run", href: "/runs/01HXYZ" },
  ];

  let selectedVersionId = $state<VersionId>("v4");
  let restoreConfirmOpen = $state(false);
  let restoreState = $state("");
  let commentText = $state("");
  let commentError = $state("");
  let permissionDenied = $state(false);
  let comments = $state<CommentEntry[]>([
    { id: "c1", author: "PM", body: "Confirm the capture brief is still the source of truth.", state: "open" },
    { id: "c2", author: "Design", body: "Diff colors pass with glyph labels, not color alone.", state: "resolved" },
  ]);

  const selectedVersion = $derived(versions.find((version) => version.id === selectedVersionId) ?? versions[0]);
  const openCommentCount = $derived(comments.filter((comment) => comment.state === "open").length);

  function selectVersion(id: VersionId): void {
    selectedVersionId = id;
    restoreConfirmOpen = false;
    restoreState = "";
  }

  function requestRestore(): void {
    restoreConfirmOpen = true;
    restoreState = "";
  }

  function confirmRestore(): void {
    restoreConfirmOpen = false;
    restoreState = `Restored ${selectedVersion.label}; version 5 records the restore event.`;
  }

  function addComment(): void {
    const body = commentText.trim();
    commentError = "";
    if (permissionDenied) {
      commentError = "Permission denied. Ask an editor to grant comment access.";
      return;
    }
    if (!body) {
      commentError = "Comment cannot be empty.";
      return;
    }
    if (body.toLowerCase().includes("fail")) {
      commentError = "Comment save failed. Draft preserved for retry.";
      return;
    }

    comments = [{ id: `c${comments.length + 1}`, author: "You", body, state: "open" }, ...comments];
    commentText = "";
  }

  function resolveComment(id: string): void {
    comments = comments.map((comment) => comment.id === id ? { ...comment, state: "resolved" } : comment);
  }

  function clearComments(): void {
    comments = [];
    commentError = "";
  }
</script>

<svelte:head>
  <title>Build timeline · document history</title>
</svelte:head>

<main data-build-timeline class={cn("min-h-screen bg-background text-foreground")}>
  <div class={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div class={cn("min-w-0")}>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Build · Timeline</p>
        <h1 class={cn("type-h1")}>Document version history</h1>
        <p class={cn("mt-2 max-w-3xl text-sm text-muted-foreground")}>
          Audit document changes, compare diffs, restore with confirmation, resolve comments, and keep planning context connected.
        </p>
      </div>
      <Badge data-open-comment-count variant={openCommentCount > 0 ? "warning" : "success"}>{openCommentCount} open comments</Badge>
    </header>

    <section class={cn("grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]")}>
      <aside data-version-timeline class={cn("rounded-md border border-border bg-card p-3")}>
        <div class={cn("mb-3 flex items-center justify-between gap-2")}>
          <h2 class={cn("text-sm font-semibold")}>Versions</h2>
          <Badge variant="outline">4 total</Badge>
        </div>
        <div class={cn("grid gap-2")}>
          {#each versions as version (version.id)}
            <Button
              data-version-row={version.id}
              data-selected={selectedVersionId === version.id ? "true" : "false"}
              type="button"
              variant={selectedVersionId === version.id ? "default" : "outline"}
              class="h-auto min-h-20 w-full justify-start whitespace-normal px-3 py-2 text-left"
              onclick={() => selectVersion(version.id)}
            >
              <span class={cn("grid min-w-0 gap-1")}>
                <span class={cn("font-medium")}>{version.label}</span>
                <span class={cn("text-xs opacity-80")}>{version.author} · {version.time}</span>
                <span class={cn("text-xs opacity-80")}>{version.summary}</span>
              </span>
            </Button>
          {/each}
        </div>
      </aside>

      <section data-version-diff class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
        <div class={cn("flex flex-wrap items-start justify-between gap-3")}>
          <div class={cn("min-w-0")}>
            <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Selected diff</p>
            <h2 data-selected-version class={cn("text-lg font-semibold")}>{selectedVersion.label}</h2>
            <p data-selected-summary class={cn("mt-1 text-sm text-muted-foreground")}>{selectedVersion.summary}</p>
          </div>
          <Button data-restore-request type="button" variant="outline" onclick={requestRestore}>Restore version</Button>
        </div>

        <div class={cn("mt-4 overflow-hidden rounded-md border border-border font-mono text-sm")} role="table" aria-label="Document version diff">
          <div data-diff-line="removed" role="row" class={cn("grid grid-cols-[72px_minmax(0,1fr)] border-b border-border bg-destructive/10 text-destructive")}>
            <span role="cell" class={cn("border-r border-border px-3 py-2")}>Removed</span>
            <span role="cell" class={cn("min-w-0 px-3 py-2")}>{selectedVersion.removed}</span>
          </div>
          <div data-diff-line="added" role="row" class={cn("grid grid-cols-[72px_minmax(0,1fr)] bg-success/10 text-success")}>
            <span role="cell" class={cn("border-r border-border px-3 py-2")}>Added</span>
            <span role="cell" class={cn("min-w-0 px-3 py-2")}>{selectedVersion.added}</span>
          </div>
        </div>

        {#if restoreConfirmOpen}
          <Alert data-restore-confirm tone="warning" class="mt-4">
            <div class={cn("grid gap-3")}>
              <p>Restore requires confirmation. A new version will record {selectedVersion.label}, author, time, and reason.</p>
              <div class={cn("flex flex-wrap gap-2")}>
                <Button data-restore-confirm-action type="button" onclick={confirmRestore}>Confirm restore</Button>
                <Button data-restore-cancel type="button" variant="outline" onclick={() => (restoreConfirmOpen = false)}>Cancel</Button>
              </div>
            </div>
          </Alert>
        {/if}
        {#if restoreState}
          <p data-restore-state role="status" class={cn("mt-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success")}>{restoreState}</p>
        {/if}

        <section data-backlinks class={cn("mt-4 rounded-md border border-border bg-background p-3")}>
          <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
            <h3 class={cn("text-sm font-semibold")}>Backlinks and planning context</h3>
            <Button data-start-planning type="button" href="/docs/mock-doc/planning" size="sm">Start planning from doc</Button>
          </div>
          <div class={cn("mt-3 grid gap-2")}>
            {#each backlinks as link (link.label)}
              <a data-backlink={link.label} href={link.href} class={cn("rounded-md border border-border px-3 py-2 text-sm hover:bg-muted")}>
                <span class={cn("font-medium")}>{link.label}</span>
                <span class={cn("ml-2 text-muted-foreground")}>{link.source}</span>
              </a>
            {/each}
          </div>
        </section>
      </section>

      <aside data-comment-panel class={cn("rounded-md border border-border bg-card p-4")}>
        <div class={cn("flex items-start justify-between gap-3")}>
          <div>
            <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Comments</p>
            <h2 class={cn("text-base font-semibold")}>Review thread</h2>
          </div>
          <div class={cn("flex flex-wrap justify-end gap-2")}>
            <Button data-clear-comments type="button" variant="outline" size="sm" onclick={clearComments}>Clear thread</Button>
            <Button data-permission-toggle type="button" variant={permissionDenied ? "destructive" : "outline"} size="sm" onclick={() => (permissionDenied = !permissionDenied)}>
              {permissionDenied ? "Permission denied" : "Can comment"}
            </Button>
          </div>
        </div>

        <form data-comment-form class={cn("mt-4 grid gap-3")} onsubmit={(event) => { event.preventDefault(); addComment(); }}>
          <FormField label="Add comment" htmlFor="doc-version-comment" error={commentError}>
            <Textarea id="doc-version-comment" data-comment-input bind:value={commentText} placeholder="Ask for context or note a restore reason" />
          </FormField>
          <Button data-comment-submit type="submit">Add comment</Button>
        </form>

        <div data-comment-list class={cn("mt-4 grid gap-2")}>
          {#if comments.length === 0}
            <p data-comment-empty role="status" class={cn("rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground")}>No comments yet.</p>
          {/if}
          {#each comments as comment (comment.id)}
            <article data-comment-row={comment.id} data-state={comment.state} class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
              <div class={cn("flex items-start justify-between gap-2")}>
                <div class={cn("min-w-0")}>
                  <p class={cn("font-medium")}>{comment.author}</p>
                  <p class={cn("mt-1 text-muted-foreground")}>{comment.body}</p>
                </div>
                <Badge variant={comment.state === "resolved" ? "success" : "accent"}>{comment.state}</Badge>
              </div>
              {#if comment.state === "open"}
                <Button data-resolve-comment={comment.id} type="button" variant="outline" size="sm" class="mt-3" onclick={() => resolveComment(comment.id)}>Resolve</Button>
              {/if}
            </article>
          {/each}
        </div>
      </aside>
    </section>
  </div>
</main>
