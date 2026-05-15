<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import type { SessionWorkbenchModel } from "@agent-client-protocol/interface/session-workbench.ts";

  interface Props {
    model: SessionWorkbenchModel;
  }

  let { model }: Props = $props();

  const statusLabel: Record<string, string> = {
    idle: "Idle",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    connected: "Connected",
    error: "Error",
  };
</script>

<section
  data-agent-session-workbench
  data-session-status={model.connection.status}
  class={cn("rounded-lg border border-border bg-background p-4")}
>
  <header class={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3")}>
    <div>
      <h2 class={cn("text-base font-semibold")}>Session workbench</h2>
      {#if model.session}
        <p data-session-title class={cn("mt-1 text-sm text-muted-foreground")}>{model.session.title}</p>
      {:else}
        <p data-session-empty class={cn("mt-1 text-sm text-muted-foreground")}>No active session</p>
      {/if}
    </div>
    <span data-session-status-label class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
      {statusLabel[model.connection.status] ?? model.connection.status}
    </span>
  </header>

  {#if model.connection.error}
    <p data-session-error class={cn("mt-3 text-sm text-destructive")}>{model.connection.error}</p>
  {/if}

  <div data-session-controls class={cn("mt-4 flex flex-wrap gap-2")}>
    <button type="button" disabled={!model.controls.canPrompt} class={cn(buttonVariants({ variant: "default", size: "sm" }))}>
      Prompt
    </button>
    <button type="button" disabled={!model.controls.canCancel} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      Cancel
    </button>
    <button type="button" disabled={!model.controls.canDisconnect} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      Disconnect
    </button>
  </div>

  <div class={cn("mt-4 grid gap-4 md:grid-cols-3")}>
    <div data-session-selectors class={cn("space-y-3")}>
      <div>
        <h3 class={cn("text-sm font-medium")}>Modes</h3>
        {#if model.modes.length === 0}
          <p class={cn("text-xs text-muted-foreground")}>None</p>
        {:else}
          <div class={cn("mt-2 flex flex-wrap gap-1")}>
            {#each model.modes as mode}
              <span data-session-mode={mode.id} data-selected={mode.selected} class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
                {mode.name}
              </span>
            {/each}
          </div>
        {/if}
      </div>
      <div>
        <h3 class={cn("text-sm font-medium")}>Models</h3>
        {#if model.models.length === 0}
          <p class={cn("text-xs text-muted-foreground")}>None</p>
        {:else}
          <div class={cn("mt-2 flex flex-wrap gap-1")}>
            {#each model.models as runtimeModel}
              <span data-session-model={runtimeModel.modelId} data-selected={runtimeModel.selected} class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
                {runtimeModel.name}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div data-session-traffic class={cn("space-y-2")}>
      <h3 class={cn("text-sm font-medium")}>Traffic</h3>
      <dl class={cn("grid grid-cols-2 gap-2 text-xs")}>
        <div><dt class={cn("text-muted-foreground")}>Total</dt><dd>{model.traffic.summary.total}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Requests</dt><dd>{model.traffic.summary.requests}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Responses</dt><dd>{model.traffic.summary.responses}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Notifications</dt><dd>{model.traffic.summary.notifications}</dd></div>
      </dl>
      {#if model.traffic.entries.length > 0}
        <ol class={cn("space-y-1 text-xs")}>
          {#each model.traffic.entries.slice(0, 3) as entry}
            <li data-session-traffic-entry={entry.id} class={cn("truncate text-muted-foreground")}>
              {entry.method}
            </li>
          {/each}
        </ol>
      {/if}
    </div>

    <div data-session-toolcalls class={cn("space-y-2")}>
      <h3 class={cn("text-sm font-medium")}>Tool calls</h3>
      <dl class={cn("grid grid-cols-2 gap-2 text-xs")}>
        <div><dt class={cn("text-muted-foreground")}>Total</dt><dd>{model.toolCalls.summary.total}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Active</dt><dd>{model.toolCalls.summary.pending + model.toolCalls.summary.inProgress}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Done</dt><dd>{model.toolCalls.summary.completed}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Failed</dt><dd>{model.toolCalls.summary.failed}</dd></div>
      </dl>
    </div>
  </div>

  {#if model.permission}
    <div data-session-permission class={cn("mt-4 rounded-md border border-border p-3")}>
      <h3 class={cn("text-sm font-medium")}>{model.permission.toolCall.title}</h3>
      <div class={cn("mt-2 flex flex-wrap gap-2")}>
        {#each model.permission.options as option}
          <button type="button" data-permission-option={option.optionId} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {option.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div data-session-messages class={cn("mt-4 space-y-2")}>
    <h3 class={cn("text-sm font-medium")}>Messages</h3>
    {#if model.messages.length === 0}
      <p data-session-messages-empty class={cn("text-sm text-muted-foreground")}>No messages</p>
    {:else}
      <ol class={cn("space-y-2")}>
        {#each model.messages as message}
          <li data-session-message={message.id} class={cn("rounded-md border border-border p-2 text-sm")}>
            <span class={cn("font-medium")}>{message.role}</span>
            <p class={cn("mt-1 whitespace-pre-wrap")}>{message.content}</p>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>
