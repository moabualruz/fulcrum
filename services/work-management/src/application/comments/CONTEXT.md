# Comments

Application-layer commands and queries for threaded Task comments, emoji reactions, and Watcher subscriptions; thin orchestration over `WorkItemCommentService`.

## Language

**Comment**:
A user-authored note attached to one Task, with a ProseMirror-style `body` jsonb, an authorId, optional `parentCommentId` for threading, and a `resolved` flag.
_Avoid_: Note, message, reply, post, discussion entry.

**Thread**:
A Comment plus its descendants linked by `parentCommentId`, returned in nested form by `getThreadedTaskComments` and in flat form by `listTaskComments`.
_Avoid_: Conversation, chain, reply tree.

**Reaction**:
An emoji response by one user to one Comment, keyed on `(commentId, userId, emoji)` and idempotent on add.
_Avoid_: Like, vote, ack, emoji-vote.

**Watcher**:
A `TaskWatcher` row recording that a user follows comment activity on a Task, tagged with a `source` of how the subscription started.
_Avoid_: Subscriber, follower, listener, observer.

**Watcher source**:
The origin tag on a Watcher: `manual` (explicit subscribe call), `create` (auto-subscribed comment author), or `mention` (auto-subscribed via `@user` or expanded `@team` in a Comment body).
_Avoid_: Reason, kind, trigger, cause.

**Resolved**:
A Comment-level boolean marking the thread as addressed, with `resolvedBy` userId and `resolvedAt` timestamp; toggled via `resolveTaskComment` / `unresolveTaskComment`.
_Avoid_: Closed, done, archived, dismissed.

**Mention**:
A `type: "mention"` node inside a Comment `body` that references a user or team and triggers auto-subscription of the mentioned identities.
_Avoid_: Tag, ping, @-reference, callout.

## Relationships

- A **Task** has many **Comments**; a **Comment** belongs to exactly one Task and one Org.
- A **Comment** may have one parent **Comment** (`parentCommentId`), forming a **Thread**.
- A **Comment** has many **Reactions**; a Reaction belongs to one Comment and one user.
- A **Task** has many **Watchers**; each Watcher row binds one user to one Task with one **Watcher source**.
- Creating a **Comment** auto-creates a Watcher with source `create` for the author and source `mention` for every mentioned user or expanded team member.
- A **Comment** may be **Resolved** by any user in the Org; resolving does not delete it or its Reactions.

## Example dialogue

> **Dev:** "If I `@team-platform` in a **Comment**, does every member become a **Watcher**?"
> **Domain expert:** "Yes — team **Mentions** expand to members and each gets a Watcher with `source: 'mention'`. If they later hit subscribe explicitly, the source stays `mention` — we don't overwrite to `manual`."
> **Dev:** "And resolving the **Thread** — does it unsubscribe Watchers?"
> **Domain expert:** "No. **Resolved** is just a flag on the root Comment. Watchers persist until the user unsubscribes."

## Flagged ambiguities

(none)
