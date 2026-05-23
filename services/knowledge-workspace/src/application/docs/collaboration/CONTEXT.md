# Docs Collaboration

Real-time collaboration plumbing behind the parent `CollabProvider`: feature-flag guard, Yjs provider config factory, Hocuspocus server config + persistence adapter, and a Bun WebSocket room manager.

## Language

**CollabFlag**:
The `real-time-collab-server` entry in `FULCRUM_FEATURES` that gates every WebSocket path; `y-indexeddb` ignores it.
_Avoid_: Realtime toggle, ws flag.

**CollabRoom**:
A `doc:<id>` or `task:<id>` named Y.Doc keyed by room name, ref-counted by active WebSocket connections and reaped on last disconnect.
_Avoid_: Channel, session, group.

**RoomPrefix**:
The `doc:` vs `task:` segment of a `CollabRoom` name that routes persistence — only `doc:` rooms map back to a `Document` entity.
_Avoid_: Namespace, kind, tag.

**HocuspocusPersistenceAdapter**:
The bridge that serializes `Y.Doc` state to `bytea` for `doc_versions.yjs_state` and extracts the `Document` id from a `doc:` `RoomPrefix`.
_Avoid_: Yjs store, persister.

**CollabEndpoint**:
The `ws://<host>:<port>/collab` URL returned by `getCollabEndpoint`, or `null` when `CollabFlag` is off.
_Avoid_: Collab URL, socket address.

**ProviderConfig**:
The plain-object output of `createCollabProviders` describing `indexeddbProviderName`, optional `WsProviderConfig`, and a `YDocStub` — the Svelte editor instantiates the real providers from it.
_Avoid_: Provider, transport config.

## Relationships

- A parent `CollabProvider` is realised by exactly one **ProviderConfig** per `docId`; its `WsProviderConfig` is non-null only when **CollabFlag** is on.
- A **CollabEndpoint** exists iff **CollabFlag** is on; the WebSocket server and `ProviderConfig.wsUrl` resolve to the same `host:port/collab`.
- A **CollabRoom** is created on first connection and deleted when its connection count reaches zero; **HocuspocusPersistenceAdapter** writes a `DocVersion` row only for rooms whose **RoomPrefix** is `doc:`.

## Example dialogue

> **Dev:** "If `real-time-collab-server` is off, do we still get a `ydoc` back from `createCollabProviders`?"
> **Domain expert:** "Yes — you get a `YDocStub` plus an `indexeddbProviderName`, but `wsProviderConfig` and `wsUrl` are `null`. Offline persistence still works; the **CollabEndpoint** just doesn't exist."
> **Dev:** "And a `task:` room — does Hocuspocus persist it to `doc_versions`?"
> **Domain expert:** "No. `extractDocId` returns `null` for any non-`doc:` **RoomPrefix**, so the document adapter skips persistence. Task descriptions go through their own adapter."

## Flagged ambiguities

- **"Provider"** — overloaded between the parent **CollabProvider** (the Yjs transport pair concept) and the **ProviderConfig** object this module returns. Resolution: this sub-area always says **ProviderConfig** for the data, **CollabProvider** only when referring to the realised pair.
- **"Room"** vs **"Document"** — a **CollabRoom** is keyed by `doc:<id>`/`task:<id>`, not by `Document.id` alone; only the `doc:` **RoomPrefix** maps back to a `Document`.
