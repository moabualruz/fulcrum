# Collaboration

Real-time multi-user editing for tasks and documents, gated by a feature flag and powered by a Hocuspocus/Yjs server with TipTap client extensions.

## Language

**CollabServer**:
A Hocuspocus v4 process that hosts Yjs **Rooms** and persists their content back to storage on debounced flushes.
_Avoid_: Sync server, WebSocket server, hub.

**Room**:
A named Yjs document keyed `task:<ulid>` or `doc:<ulid>` that all clients editing the same entity join.
_Avoid_: Channel, session, doc-room.

**RoomKind**:
The entity class encoded in a **Room** name — `task` or `doc` — parsed to dispatch hydration and persistence.
_Avoid_: Room type, entity kind.

**CollabExtensionDescriptor**:
A name/config pair describing a TipTap extension (`collaboration`, `collaborationCursor`) that the editor mounts only when the flag is ON.
_Avoid_: Plugin, extension config, TipTap plugin.

**CollabProviderUrl**:
The `ws://host:port/<roomName>` address a client uses to attach a HocuspocusProvider to a **Room**.
_Avoid_: Socket URL, sync URL, endpoint.

**StoreDebounce**:
The fixed inactivity window (`STORE_DEBOUNCE_MS`) after which the server flushes a **Room**'s serialized content to the database.
_Avoid_: Throttle, save delay, write buffer.

**UserColor**:
A deterministic HSL string derived from a user ID, attached to the `collaborationCursor` extension for overlay rendering.
_Avoid_: Cursor color, presence color.

**CollabFlag**:
The `real-time-collab-server` token inside `FULCRUM_FEATURES` that gates both server startup and client extension wiring.
_Avoid_: Feature toggle, env switch.

## Relationships

- A **CollabServer** hosts many **Rooms**; each **Room** has exactly one **RoomKind** (`task` or `doc`).
- A **Room**'s persistence flows through one `onLoadDocument` (hydrate from DB) and one debounced `onStoreDocument` (write to DB after **StoreDebounce**).
- A client builds zero or two **CollabExtensionDescriptors** (`collaboration` + `collaborationCursor`) — zero when **CollabFlag** is OFF, two when ON.
- A `collaborationCursor` carries one **UserColor** derived from the user ID.
- A **CollabProviderUrl** targets exactly one **Room** on one **CollabServer**.

## Example dialogue

> **Dev:** "If the **CollabFlag** is OFF, does the editor still open a **Room**?"
> **Domain expert:** "No — `buildCollabExtensions` returns an empty array and `collabProviderUrl` returns null, so TipTap mounts with no `collaboration` extension and no socket. The **CollabServer** isn't started either."
> **Dev:** "And when a task **Room** receives edits?"
> **Domain expert:** "The server schedules a **StoreDebounce**; after 2s of inactivity it serializes the Y.Doc and updates `tasks.tiptap_content`. Doc **Rooms** parse but aren't persisted here yet."

## Flagged ambiguities

- **"Document"** — in the parent context this is the curated knowledge artifact; here a "doc **Room**" is a `RoomKind: doc` Yjs document keyed by a Document ULID. Resolution: say **Room** for the live editing surface, **Document** for the persisted entity.
- **"Provider"** — overloaded: the client-side `HocuspocusProvider` (injected at mount) versus generic NestJS providers. Resolution: always qualify as "HocuspocusProvider" or "collab provider" in this area.
