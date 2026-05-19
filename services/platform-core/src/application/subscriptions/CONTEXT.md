# Subscriptions

In-process pub/sub transport for live updates across web, CLI, and TUI surfaces, fed by a database `LISTEN/NOTIFY` bridge with a polling fallback.

## Language

**SubscriptionEvent**:
An envelope (`id`, `topic`, `type`, `traceId`, `payload`, `timestamp`) delivered to topic subscribers.
_Avoid_: message, notification, signal, payload

**Topic**:
A dotted string address (`agent_run.<id>`, `project.<id>.tasks`, `org.<id>.notifications`, `orchestration.<orgId>`) that scopes a subscription.
_Avoid_: channel, room, subject, key

**EventBus**:
The process-singleton in-memory broker that routes `SubscriptionEvent`s to handlers registered on a `Topic`.
_Avoid_: emitter, dispatcher, pubsub, broker

**NotifyBridge**:
The component that listens on PostgreSQL `NOTIFY` channels and republishes payloads onto the `EventBus`.
_Avoid_: listener, notify pump, pg-bridge

**PGChannel**:
A flat PostgreSQL `NOTIFY` channel name (`agent_run`, `project_tasks`, `org_notifications`, `orchestration`) that the bridge maps to and from a `Topic`.
_Avoid_: notify channel, pg topic

**PollingFallback**:
The 5s timer loop gated by `FULCRUM_FEATURES=ws-polling-fallback` that drains a `PollingSource` into the `EventBus` when `LISTEN/NOTIFY` is unavailable.
_Avoid_: poller, backup stream, retry loop

**PollingSource**:
A pull-based event provider exposing `poll(lastSeenId)`, used only by `PollingFallback`.
_Avoid_: feed, fetcher, cursor

## Relationships

- A **Topic** is published to by one **NotifyBridge** or one **PollingFallback** at a time and fanned out by the **EventBus** to many handlers.
- A **NotifyBridge** maps each subscribed **PGChannel** to one or more **Topic**s via the channel-prefix table.
- A **PollingFallback** writes the same **SubscriptionEvent** shape onto the **EventBus** as the **NotifyBridge**; consumers cannot tell the source apart.
- A **SubscriptionEvent**'s `traceId` is inherited from the payload when present, linking transport delivery to the upstream **Event** / **DomainEventOutbox** that produced it.

## Example dialogue

> **Dev:** "If the **NotifyBridge** is up, do I still need the **PollingFallback** running?"
> **Domain expert:** "No — **PollingFallback** only starts when `ws-polling-fallback` is in `FULCRUM_FEATURES`. The **EventBus** doesn't care which source published; the **SubscriptionEvent** shape is identical."
> **Dev:** "And the **PGChannel** isn't the **Topic**?"
> **Domain expert:** "Right. `project_tasks` is one **PGChannel** but carries many **Topic**s like `project.<id>.tasks`; the bridge reads the `topic` field from the JSON payload."

## Flagged ambiguities

- "event" overlaps the parent context's **Event** (audit), **DomainEventOutbox** (cross-service dispatch), and **TelemetryEvent** (analytics) — resolved: a **SubscriptionEvent** is the transport envelope only; it may *carry* a payload sourced from any of those but is not stored or reprocessed.
- "channel" was used for both `EventEmitter` topic and PostgreSQL `NOTIFY` channel — resolved: **Topic** is the subscriber-facing dotted address; **PGChannel** is the flat Postgres name the bridge maps to.
