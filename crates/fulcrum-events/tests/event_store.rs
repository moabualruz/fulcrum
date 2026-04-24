use fulcrum_events::{EventKind, EventStore};

#[test]
fn appends_and_replays_events_in_order() {
    let mut store = EventStore::new();

    let first = store.append(
        EventKind::WorkspaceCreated,
        "ws_000001",
        "workspace created",
    );
    let second = store.append(EventKind::TaskCreated, "task_000001", "task created");

    assert_eq!(first.id, "evt_000001");
    assert_eq!(second.id, "evt_000002");
    assert_eq!(store.replay()[0].subject, "ws_000001");
    assert_eq!(store.replay()[1].subject, "task_000001");
}

#[test]
fn filters_events_by_kind() {
    let mut store = EventStore::new();

    store.append(
        EventKind::WorkspaceCreated,
        "ws_000001",
        "workspace created",
    );
    store.append(EventKind::TaskCreated, "task_000001", "task created");
    store.append(EventKind::TaskCreated, "task_000002", "task created");

    let tasks = store.by_kind(EventKind::TaskCreated);

    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0].subject, "task_000001");
    assert_eq!(tasks[1].subject, "task_000002");
}
