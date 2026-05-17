<script lang="ts">
  /**
   * PresenceIndicators.svelte — Yjs awareness-based user presence (workflow milestone, D-99).
   *
   * Shows avatar dots for active users on the current document.
   * Uses y-websocket awareness protocol with heartbeat-based presence.
   * Max 5 visible avatars + overflow count.
   */
  import { onMount, onDestroy } from "svelte";
  import * as Y from "yjs";
  import { WebsocketProvider } from "y-websocket";

  // ── Props ────────────────────────────────────────────────────────────────

  interface Props {
    taskId: string;
    currentUser?: { name: string; color?: string };
    /** Max visible avatars before showing overflow */
    maxVisible?: number;
  }

  let {
    taskId,
    currentUser = { name: "Me", color: "#6366f1" },
    maxVisible = 5,
  }: Props = $props();

  // ── Types ─────────────────────────────────────────────────────────────────

  interface PresenceUser {
    clientId: number;
    name: string;
    color: string;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let activeUsers = $state<PresenceUser[]>([]);
  let provider: WebsocketProvider | null = null;
  let ydoc: Y.Doc | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getYjsUrl(): string {
    const url =
      typeof import.meta !== "undefined"
        ? (import.meta.env?.PUBLIC_FULCRUM_YJS_URL as string | undefined)
        : undefined;
    return url ?? "ws://localhost:1234";
  }

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(() => {
    ydoc = new Y.Doc();
    const docName = `task-${taskId}`;
    const yjsUrl = getYjsUrl();

    try {
      provider = new WebsocketProvider(yjsUrl, docName, ydoc, { connect: true });

      // Set own presence
      provider.awareness.setLocalStateField("user", {
        name: currentUser.name,
        color: currentUser.color ?? "#6366f1",
      });

      // Update active users on awareness change
      const updateUsers = () => {
        const states = provider!.awareness.getStates();
        const users: PresenceUser[] = [];
        const myClientId = provider!.awareness.clientID;

        states.forEach((state, clientId) => {
          if (clientId === myClientId) return; // exclude self
          if (state.user) {
            users.push({
              clientId,
              name: state.user.name ?? "Unknown",
              color: state.user.color ?? "#94a3b8",
            });
          }
        });

        activeUsers = users;
      };

      provider.awareness.on("change", updateUsers);
      updateUsers();

      // Heartbeat: re-send presence every 30s to handle reconnects
      heartbeatInterval = setInterval(() => {
        if (provider?.awareness) {
          provider.awareness.setLocalStateField("user", {
            name: currentUser.name,
            color: currentUser.color ?? "#6366f1",
          });
        }
      }, 30_000);
    } catch (_e) {
      // Graceful fallback: awareness unavailable
      console.warn("[PresenceIndicators] WebSocket unavailable");
    }
  });

  onDestroy(() => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    provider?.awareness?.setLocalState(null);
    provider?.destroy();
    ydoc?.destroy();
    provider = null;
    ydoc = null;
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const visibleUsers = $derived(activeUsers.slice(0, maxVisible));
  const overflowCount = $derived(Math.max(0, activeUsers.length - maxVisible));
</script>

{#if activeUsers.length > 0}
  <div
    data-testid="presence-indicators"
    class="presence-indicators flex items-center gap-1"
    title="{activeUsers.length} {activeUsers.length === 1 ? 'person' : 'people'} viewing"
  >
    {#each visibleUsers as user (user.clientId)}
      <div
        class="presence-avatar flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
        style="background-color: {user.color};"
        title={user.name}
        aria-label="{user.name} is viewing"
      >
        {getInitials(user.name)}
      </div>
    {/each}

    {#if overflowCount > 0}
      <div
        class="presence-overflow flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
        title="+{overflowCount} more"
      >
        +{overflowCount}
      </div>
    {/if}
  </div>
{/if}
