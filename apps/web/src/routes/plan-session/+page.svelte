<script lang="ts">
  import { onMount } from "svelte";
  import { Badge, Button, Chip, StatusBadge, TraceChip } from "@fulcrum/ui-kit";

  type TrafficKind = "session/update" | "agent_message_chunk" | "tool_call" | "tool_call_update" | "trace_link";
  type TrafficRow = { id: string; kind: TrafficKind; at: string; summary: string; payload: string };

  const STORAGE_KEY = "fulcrum.plan-session.fixture";
  const TRACE_ID = "tr_19b4a7c2e6f04d91";
  const SESSION_ID = "plan_sess_auth_rewrite";
  const SOURCE_DOC_ID = "doc_auth_rewrite";

  const initialTraffic: TrafficRow[] = [
    {
      id: "evt-1",
      kind: "session/update",
      at: "10:41:02",
      summary: "Planning session started",
      payload: `{"session_id":"${SESSION_ID}","trace_id":"${TRACE_ID}","status":"running"}`,
    },
    {
      id: "evt-2",
      kind: "tool_call",
      at: "10:41:05",
      summary: "Loaded source document and linked tasks",
      payload: `{"tool":"planning.sources.read","source_doc_id":"${SOURCE_DOC_ID}","task_ids":["AUTH-42","AUTH-51"]}`,
    },
    {
      id: "evt-3",
      kind: "agent_message_chunk",
      at: "10:41:08",
      summary: "Drafted first plan outline",
      payload: "{\"chunk\":\"Start with migration guard, then service contract, then web proof.\"}",
    },
  ];

  const sourceLinks = [
    { label: "Source document", href: `/docs/${SOURCE_DOC_ID}/planning`, value: SOURCE_DOC_ID },
    { label: "Session detail", href: `/planning/sessions#${SESSION_ID}`, value: SESSION_ID },
    { label: "Trace summary", href: `/trace/${TRACE_ID}`, value: TRACE_ID },
  ];

  let prompt = $state("Draft a plan from the source doc, keep trace links visible, and call out blockers.");
  let sourceDocId = $state(SOURCE_DOC_ID);
  let sessionId = $state(SESSION_ID);
  let traceId = $state(TRACE_ID);
  let status = $state<"running" | "paused">("running");
  let traffic = $state<TrafficRow[]>(initialTraffic);
  let selectedEventId = $state(initialTraffic[1].id);
  let error = $state("");
  let resumed = $state(false);

  const selectedEvent = $derived(traffic.find((row) => row.id === selectedEventId) ?? traffic[0]);

  onMount(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as {
        prompt?: string;
        sourceDocId?: string;
        sessionId?: string;
        traceId?: string;
        status?: "running" | "paused";
        traffic?: TrafficRow[];
        selectedEventId?: string;
      };
      prompt = saved.prompt ?? prompt;
      sourceDocId = saved.sourceDocId ?? sourceDocId;
      sessionId = saved.sessionId ?? sessionId;
      traceId = saved.traceId ?? traceId;
      status = saved.status ?? status;
      traffic = saved.traffic?.length ? saved.traffic : traffic;
      selectedEventId = saved.selectedEventId ?? selectedEventId;
      resumed = true;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompt, sourceDocId, sessionId, traceId, status, traffic, selectedEventId }));
  });

  function submitPrompt(): void {
    if (!sourceDocId.trim() || !sessionId.trim() || !traceId.trim()) {
      error = `Planning needs source, session, and trace IDs. Fill missing IDs, or open trace ${TRACE_ID} in Audit. trace=${TRACE_ID}`;
      return;
    }

    error = "";
    const next = traffic.length + 1;
    const id = `evt-${next}`;
    traffic = [
      ...traffic,
      {
        id,
        kind: "session/update",
        at: "10:42:14",
        summary: "Prompt submitted and persisted",
        payload: JSON.stringify({ session_id: sessionId, source_doc_id: sourceDocId, trace_id: traceId, prompt }),
      },
      {
        id: `evt-${next + 1}`,
        kind: "tool_call_update",
        at: "10:42:18",
        summary: "Plan workspace updated",
        payload: "{\"plan_strip\":\"migration guard -> service contract -> web proof\",\"persisted\":true}",
      },
    ];
    selectedEventId = id;
    status = "running";
  }

  function pause(): void {
    status = "paused";
  }

  function resume(): void {
    status = "running";
    resumed = true;
  }

  function clearSourceIds(): void {
    sourceDocId = "";
    sessionId = "";
  }
</script>

<svelte:head>
  <title>Plan session | Fulcrum</title>
</svelte:head>

<main class="min-h-screen overflow-x-hidden bg-background p-4 text-foreground sm:p-6" data-plan-session-page>
  <section class="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
    <aside class="rounded-md border border-border bg-card p-4" data-session-list>
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-lg font-semibold tracking-normal">AI Assist planning</h1>
        <StatusBadge status={status === "running" ? "running" : "paused"} />
      </div>
      <p class="mt-2 text-xs leading-5 text-muted-foreground">Live planning sessions stay resumable across reloads.</p>

      <button type="button" class="mt-4 w-full rounded-md border border-accent bg-accent/10 p-3 text-left" data-session-card={sessionId || "missing-session"} onclick={resume}>
        <span class="block text-sm font-semibold">{sessionId || "Missing session id"}</span>
        <span class="mt-1 block font-mono text-[11px] text-muted-foreground">{traceId || TRACE_ID}</span>
      </button>

      <div class="mt-4 grid gap-2 text-xs" data-session-actions>
        <Button type="button" variant="outline" size="sm" onclick={pause}>Pause</Button>
        <Button type="button" size="sm" onclick={resume}>Resume session</Button>
      </div>
      {#if resumed}
        <p class="mt-3 rounded-md bg-muted p-2 text-xs" data-session-resumed>Session restored from local persistence.</p>
      {/if}
    </aside>

    <section class="min-w-0 rounded-md border border-border bg-card" data-live-session-pane>
      <header class="border-b border-border p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Plan</Badge>
          <TraceChip traceId={traceId || TRACE_ID} />
          <Chip tone="success">source linked</Chip>
        </div>
        <div class="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div class="min-w-0">
            <h2 class="text-xl font-semibold tracking-normal">Persistent planning workspace</h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Prompt, source IDs, traffic events, and trace summary links remain visible while the planning run streams.
            </p>
          </div>
          <nav class="flex flex-wrap gap-2 text-xs" aria-label="Planning links" data-trace-source-links>
            {#each sourceLinks as link}
              <a class="rounded-md border border-border px-2 py-1 font-mono hover:bg-muted" href={link.href}>{link.label}: {link.value}</a>
            {/each}
          </nav>
        </div>
      </header>

      <form class="grid gap-3 border-b border-border p-4" data-plan-session-form onsubmit={(event) => { event.preventDefault(); submitPrompt(); }}>
        <div class="grid gap-3 md:grid-cols-3">
          <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
            Source doc ID
            <input class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground" bind:value={sourceDocId} data-source-doc-input />
          </label>
          <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
            Session ID
            <input class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground" bind:value={sessionId} data-session-id-input />
          </label>
          <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
            Trace ID
            <input class="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground" bind:value={traceId} data-trace-id-input />
          </label>
        </div>

        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
          Prompt
          <textarea class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground" bind:value={prompt} data-plan-prompt></textarea>
        </label>

        {#if error}
          <p class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-plan-session-error>{error}</p>
        {/if}

        <div class="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onclick={clearSourceIds}>Clear required IDs</Button>
          <Button type="submit" size="sm">Submit prompt</Button>
        </div>
      </form>

      <section class="grid min-h-[28rem] gap-0 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]" data-traffic-workspace>
        <div class="min-w-0 border-b border-border 2xl:border-r 2xl:border-b-0">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 class="text-sm font-semibold tracking-normal">Traffic stream</h3>
            <span class="font-mono text-[11px] text-muted-foreground" data-traffic-count>{traffic.length} events</span>
          </div>
          <ol class="grid gap-0" data-traffic-stream>
            {#each traffic as row}
              <li>
                <button
                  type="button"
                  class="grid w-full grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted/50 {selectedEventId === row.id ? 'bg-muted' : ''}"
                  data-traffic-event={row.id}
                  onclick={() => { selectedEventId = row.id; }}
                >
                  <span class="font-mono text-[11px] text-muted-foreground">{row.at}<br />{row.kind}</span>
                  <span class="min-w-0 text-sm">{row.summary}</span>
                </button>
              </li>
            {/each}
          </ol>
        </div>

        <aside class="min-w-0 p-4" data-traffic-inspector>
          <div class="flex flex-wrap items-center gap-2">
            <Chip tone="neutral">{selectedEvent.kind}</Chip>
            <span class="font-mono text-[11px] text-muted-foreground">{selectedEvent.id}</span>
          </div>
          <h3 class="mt-3 text-sm font-semibold">{selectedEvent.summary}</h3>
          <pre class="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{selectedEvent.payload}</pre>
        </aside>
      </section>
    </section>

    <aside class="rounded-md border border-border bg-card p-4" data-trace-summary>
      <h2 class="text-sm font-semibold tracking-normal">Trace summary</h2>
      <p class="mt-2 font-mono text-xs text-muted-foreground">{traceId || TRACE_ID}</p>
      <dl class="mt-4 grid gap-3 text-xs">
        <div class="rounded-md border border-border p-3">
          <dt class="font-semibold">Session</dt>
          <dd class="mt-1 font-mono text-muted-foreground">{sessionId || "missing"}</dd>
        </div>
        <div class="rounded-md border border-border p-3">
          <dt class="font-semibold">Source doc</dt>
          <dd class="mt-1 font-mono text-muted-foreground">{sourceDocId || "missing"}</dd>
        </div>
        <div class="rounded-md border border-border p-3">
          <dt class="font-semibold">Current state</dt>
          <dd class="mt-1 text-muted-foreground">{status}</dd>
        </div>
      </dl>
      <a class="mt-4 inline-flex rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted" href={`/trace/${traceId || TRACE_ID}`} data-open-trace>
        Open trace summary
      </a>
    </aside>
  </section>
</main>
