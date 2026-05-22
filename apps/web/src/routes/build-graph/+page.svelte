<script lang="ts">
  import { Badge, Button, EmptyState, ModeRow, StatusBadge, TraceChip } from "@fulcrum/ui-kit";
  import type { WorkflowMode } from "@fulcrum/shared-dto";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  /**
   * Build · dependency graph: the OD `build-graph.html` `◇ Graph` layout.
   *
   * A Sugiyama layered dependency graph (DESIGN.md §9 orchestrator DAG,
   * research-07 §3.2): nodes laid out in left-to-right layers, status-colored
   * per DESIGN.md §4.9, connected by SVG bezier edges with arrowheads. The
   * running chain edge is accent-colored. Clicking a node opens the
   * bottom-right info card (run / agent / run-id, the path-highlight
   * explanation, Open run / Open task actions, and a per-step ModeRow per
   * DESIGN.md §4.11). The route absorbs the former `agent-dependency-board`
   * "Multi-agent dependency board" so there is one Build graph, not two -
   * see `_migrated-content/MIGRATION.md`.
   */

  /** A node's lifecycle state on the graph. OD `done|run|wait|blk|todo`. */
  type GraphState = "done" | "run" | "wait" | "blk" | "todo";

  /** One dependency-graph node. `layer`/`row` are the Sugiyama grid coords. */
  type GraphNode = {
    id: string;
    title: string;
    state: GraphState;
    meta: string;
    /** Agent that owns / ran this node; drives the agent monogram + info card. */
    agent: string;
    /** Optional run identifier shown in the info card monospace meta row. */
    runId?: string;
    /** Sugiyama layer (column), 1-based left to right. */
    layer: number;
    /** Vertical slot within the layer, 0-based top to bottom. */
    row: number;
  };

  /** A directed dependency edge `from → to`. `chain` marks the running path. */
  type GraphEdge = { from: string; to: string; chain?: boolean };

  /** OD `build-graph.html` 8-node auth-rewrite chain, 4 Sugiyama layers. */
  const NODES: GraphNode[] = [
    { id: "AUTH-45", title: "DELETE /sessions/:kid endpoint", state: "done", meta: "gpt-5.4 · merged 12m", agent: "gpt-5.4", layer: 1, row: 1 },
    { id: "AUTH-42", title: "Add kid + rotate flag to signToken", state: "done", meta: "opus-4.7 · 25m", agent: "opus-4.7", layer: 2, row: 0 },
    { id: "AUTH-43", title: "Persist issuance row per kid", state: "run", meta: "opus-4.7 · 3m elapsed", agent: "opus-4.7", runId: "run_8f29a4c", layer: 2, row: 1 },
    { id: "AUTH-44", title: "verifyToken · dual-verify legacy", state: "wait", meta: "blocked on AUTH-43", agent: "-", layer: 3, row: 0 },
    { id: "AUTH-47", title: "Rate-limiter · bucket per kid", state: "run", meta: "opus-4.7 · 1m", agent: "opus-4.7", runId: "run_2c71fd0", layer: 3, row: 1 },
    { id: "AUTH-49", title: "Settings UI · active sessions list", state: "blk", meta: "design lock", agent: "-", layer: 3, row: 2 },
    { id: "AUTH-48", title: "Telemetry · issuance/revocation", state: "todo", meta: "gemini-3-pro", agent: "gemini-3-pro", layer: 4, row: 0 },
    { id: "AUTH-46", title: "Migration · sessions table + kid", state: "todo", meta: "sonnet-4.6 · 15m", agent: "sonnet-4.6", layer: 4, row: 1 },
  ];

  const EDGES: GraphEdge[] = [
    { from: "AUTH-45", to: "AUTH-42" },
    { from: "AUTH-45", to: "AUTH-43" },
    { from: "AUTH-45", to: "AUTH-47" },
    { from: "AUTH-43", to: "AUTH-44", chain: true },
    { from: "AUTH-43", to: "AUTH-47" },
    { from: "AUTH-44", to: "AUTH-48" },
    { from: "AUTH-47", to: "AUTH-46" },
  ];

  /** OD `build-graph.html` layout switcher entries: DESIGN.md §4.4 / IA-MAP §2.3. */
  const LAYOUTS = [
    { glyph: "▦", label: "Board", href: "/build-board" },
    { glyph: "☰", label: "List", href: "/build-list" },
    { glyph: "◰", label: "Timeline", href: "/build-timeline" },
    { glyph: "◯", label: "Calendar", href: "/build-calendar" },
    { glyph: "◇", label: "Graph", href: "/build-graph" },
  ] as const;

  /** Status legend: OD `.legend` swatches, one per graph state. */
  const LEGEND: { state: GraphState; label: string }[] = [
    { state: "todo", label: "queued" },
    { state: "run", label: "running" },
    { state: "wait", label: "awaiting" },
    { state: "blk", label: "blocked" },
    { state: "done", label: "completed" },
  ];

  /** Maps the graph state to the canonical ui-kit `WorkflowStatus`. */
  const STATUS_OF: Record<GraphState, WorkflowStatus> = {
    done: "completed",
    run: "running",
    wait: "waiting-input",
    blk: "blocked",
    todo: "queued",
  };

  /** Sugiyama grid geometry: layer pitch, row pitch, node box size. */
  const LAYER_X = [0, 30, 320, 660, 1000];
  const ROW_Y = 70;
  const ROW_PITCH = 160;
  const NODE_W = 200;
  const NODE_H = 88;

  function nodeX(n: GraphNode): number {
    return LAYER_X[n.layer];
  }
  function nodeY(n: GraphNode): number {
    return ROW_Y + n.row * ROW_PITCH;
  }

  /** Bezier path between two node anchor points: OD `.canvas svg` edges. */
  function edgePath(edge: GraphEdge): string {
    const from = NODES.find((n) => n.id === edge.from);
    const to = NODES.find((n) => n.id === edge.to);
    if (!from || !to) return "";
    const x1 = nodeX(from) + NODE_W;
    const y1 = nodeY(from) + NODE_H / 2;
    const x2 = nodeX(to);
    const y2 = nodeY(to) + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    return `M${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
  }

  /** OKLCH agent monogram background per DESIGN.md §4.16 (flat, no gradient). */
  function agentMonogram(agent: string): string {
    return agent === "-" ? "-" : agent.slice(0, 2).toUpperCase();
  }

  /** OD `run` node: the pre-selected, highlighted node is AUTH-43. */
  let selectedId = $state<string>("AUTH-43");
  let mode = $state<WorkflowMode>("manual");

  const selected = $derived(NODES.find((n) => n.id === selectedId) ?? null);

  /** Forward closure from the selected node: the highlighted dependency path. */
  const highlightPath = $derived.by(() => {
    const path = new Set<string>();
    if (!selectedId) return path;
    const walk = (id: string) => {
      if (path.has(id)) return;
      path.add(id);
      for (const e of EDGES) if (e.from === id) walk(e.to);
    };
    walk(selectedId);
    return path;
  });

  function selectNode(id: string): void {
    selectedId = selectedId === id ? "" : id;
  }

  function nextNodeName(): string {
    if (!selected) return "";
    const downstream = EDGES.filter((e) => e.from === selected.id).map((e) => e.to);
    return downstream[0] ?? "";
  }
</script>

<svelte:head>
  <title>Build · dependency graph</title>
</svelte:head>

<section
  data-build-graph
  data-build-graph-ready="true"
  class={cn("flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden")}
>
  <header
    data-build-graph-toolbar
    class={cn("flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2")}
  >
    <div
      data-build-graph-layouts
      role="tablist"
      aria-label="Build layouts"
      class={cn("inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5")}
    >
      {#each LAYOUTS as layout}
        {@const active = layout.label === "Graph"}
        <a
          role="tab"
          href={layout.href}
          aria-current={active ? "page" : undefined}
          aria-selected={active}
          data-build-layout={layout.label.toLowerCase()}
          class={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            active && "bg-card text-foreground",
          )}
        >
          <span aria-hidden="true">{layout.glyph}</span>
          <span>{layout.label}</span>
        </a>
      {/each}
    </div>

    <span class={cn("flex-1")}></span>

    <ul
      data-build-graph-legend
      aria-label="Node status legend"
      class={cn("flex flex-wrap items-center gap-3 text-xs text-muted-foreground")}
    >
      {#each LEGEND as item}
        <li data-legend-swatch={item.state} class={cn("inline-flex items-center gap-1.5")}>
          <span
            aria-hidden="true"
            data-legend-dot={STATUS_OF[item.state]}
            class={cn(
              "inline-block size-2.5 rounded-full",
              item.state === "done" && "bg-success",
              item.state === "run" && "bg-accent",
              item.state === "wait" && "border border-dashed border-warning",
              item.state === "blk" && "bg-warning",
              item.state === "todo" && "bg-muted-foreground",
            )}
          ></span>
          <span>{item.label}</span>
        </li>
      {/each}
    </ul>

    <Button size="sm" variant="secondary" data-build-graph-module>⊞ Module: auth ▾</Button>
    <Button size="sm" variant="secondary" data-build-graph-layout-select>⇆ Layout: Sugiyama ▾</Button>
  </header>

  {#if NODES.length === 0}
    <div data-build-graph-empty class={cn("flex flex-1 items-center justify-center bg-muted/20 p-8")}>
      <EmptyState
        title="No graph nodes yet."
        description="The graph shows dependencies between build items. Add items in List to populate it."
        keyHint="Press n to add the first item."
      >
        {#snippet icon()}
          <span aria-hidden="true">◇</span>
        {/snippet}
        {#snippet actions()}
          <Button size="sm" href="/build-list" data-build-graph-empty-primary>Open Build list</Button>
          <Button size="sm" variant="secondary" href="/build-board" data-build-graph-empty-secondary>
            View Board
          </Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div data-build-graph-frame class={cn("relative flex-1 overflow-hidden")}>
      <div
        data-build-graph-canvas
        class={cn(
          "absolute inset-0 overflow-auto bg-muted/20",
          "[background-image:radial-gradient(circle,var(--color-border)_1px,transparent_1px)]",
          "[background-size:24px_24px]",
        )}
      >
        <div data-build-graph-stage class={cn("relative")} style="width:1280px;height:640px">
        <svg
          width="1280"
          height="640"
          aria-hidden="true"
          class={cn("pointer-events-none absolute inset-0")}
        >
          <defs>
            <marker
              id="build-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="var(--color-border)" />
            </marker>
            <marker
              id="build-graph-arrow-accent"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="var(--color-accent)" />
            </marker>
          </defs>
          {#each EDGES as edge}
            {@const onPath = highlightPath.has(edge.from) && highlightPath.has(edge.to)}
            <path
              data-build-graph-edge={`${edge.from}-${edge.to}`}
              data-edge-chain={edge.chain ? "true" : undefined}
              data-edge-highlight={onPath ? "true" : undefined}
              d={edgePath(edge)}
              fill="none"
              stroke={edge.chain || onPath ? "var(--color-accent)" : "var(--color-border)"}
              stroke-width={edge.chain || onPath ? 2 : 1.5}
              marker-end={`url(#${edge.chain || onPath ? "build-graph-arrow-accent" : "build-graph-arrow"})`}
            />
          {/each}
        </svg>

        {#each NODES as node}
          {@const onPath = highlightPath.has(node.id)}
          {@const dimmed = selectedId !== "" && !onPath}
          <button
            type="button"
            data-build-graph-node={node.id}
            data-node-state={node.state}
            data-node-status={STATUS_OF[node.state]}
            data-node-selected={selectedId === node.id ? "true" : undefined}
            data-node-highlight={onPath ? "true" : undefined}
            data-node-dim={dimmed ? "true" : undefined}
            aria-pressed={selectedId === node.id}
            aria-keyshortcuts="M K"
            title="Move with M then K"
            onclick={() => selectNode(node.id)}
            style={`left:${nodeX(node)}px;top:${nodeY(node)}px;width:${NODE_W}px`}
            class={cn(
              "absolute flex flex-col gap-1 rounded-md border bg-card p-2.5 text-left text-xs shadow-md transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              "hover:border-accent",
              node.state === "done" && "border-success",
              node.state === "run" && "border-accent data-[node-state=run]:animate-[build-graph-pulse_1.8s_ease-in-out_infinite]",
              node.state === "wait" && "border-dashed border-warning",
              node.state === "blk" && "border-warning",
              node.state === "todo" && "border-border",
              selectedId === node.id && "ring-2 ring-accent ring-offset-2 ring-offset-background",
              dimmed && "opacity-30",
            )}
          >
            <span class={cn("flex items-center gap-1.5")}>
              <StatusBadge status={STATUS_OF[node.state]} />
              <span
                aria-hidden="true"
                data-node-agent={node.agent}
                class={cn(
                  "ml-auto inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold text-foreground",
                  node.agent === "-" ? "bg-muted text-muted-foreground" : "bg-accent/15",
                )}
              >
                {agentMonogram(node.agent)}
              </span>
              <span class={cn("font-mono text-[10px] text-muted-foreground")} data-node-id>{node.id}</span>
            </span>
            <span class={cn("font-medium leading-snug text-foreground")} data-node-title>{node.title}</span>
            <span class={cn("font-mono text-[10px] text-muted-foreground")} data-node-meta>{node.meta}</span>
          </button>
        {/each}
        </div>
      </div>

      {#if selected}
        <aside
          data-build-graph-info-card
          data-info-card-node={selected.id}
          aria-label={`${selected.id} details`}
          class={cn(
            "absolute bottom-4 right-4 z-10 grid w-80 gap-2 rounded-lg border border-border bg-card p-3.5 shadow-lg",
          )}
        >
            <h2 class={cn("text-sm font-semibold text-foreground")} data-info-card-title>
              {selected.id} · {selected.title}
            </h2>
            <div class={cn("flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground")}>
              <StatusBadge status={STATUS_OF[selected.state]} data-info-card-status />
              <span data-info-card-agent>{selected.agent}</span>
              {#if selected.runId}
                <TraceChip
                  traceId={selected.runId}
                  short={false}
                  copyable={false}
                  data-info-card-run
                />
              {/if}
            </div>
            <p class={cn("text-xs leading-relaxed text-muted-foreground")} data-info-card-path>
              {#if nextNodeName()}
                Selected. Highlighted path shows {selected.id} → {nextNodeName()} and forward; other
                nodes are dimmed on the canvas.
              {:else}
                Selected. {selected.id} is a leaf node: nothing downstream depends on it.
              {/if}
            </p>
            <div class={cn("flex flex-wrap items-center gap-2")}>
              <Button size="sm" variant="ghost" data-info-card-open-run>Open run</Button>
              <Button size="sm" variant="ghost" data-info-card-open-task>Open task</Button>
              <span class={cn("flex-1")}></span>
              <ModeRow
                bind:value={mode}
                density="compact"
                ariaLabel="Step modes"
                data-info-card-mode-row
              />
            </div>
          </aside>
      {/if}
    </div>
  {/if}

  <p data-build-graph-status-line class={cn("border-t border-border bg-background px-4 py-1.5 text-[11px] text-muted-foreground")}>
    <Badge variant="outline" size="sm" data-build-graph-count>{NODES.length} nodes</Badge>
    <span class={cn("ml-2")}>auth chain · Sugiyama layered · 4 layers</span>
  </p>
</section>

<style>
  /* OD `build-graph.html` `.node.run::after` running-node pulse ring. */
  @keyframes build-graph-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 var(--color-accent);
    }
    50% {
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-accent) 35%, transparent);
    }
  }

  /* DESIGN.md §3 / app.css reduced-motion contract: the running-node pulse
     and every node transition collapse to a static frame when the operator
     prefers reduced motion. The dotted canvas and status colors remain. */
  @media (prefers-reduced-motion: reduce) {
    [data-build-graph-node] {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
