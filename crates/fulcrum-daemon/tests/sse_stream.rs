use fulcrum_daemon::{encode_sse, stream_from_cursor};
use fulcrum_kernel::Kernel;

#[test]
fn streams_events_after_cursor_for_reconnects() {
    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let cursor = kernel.events().last().unwrap().id.clone();
    let task = kernel
        .create_task(&workspace.id, &project.id, "stream event")
        .unwrap();
    kernel.start_run(&task.id, "software_engineer").unwrap();

    let events = stream_from_cursor(kernel.events(), Some(&cursor));
    let encoded = encode_sse(&events[0]);

    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event, "task.created");
    assert!(encoded.starts_with("id: evt_000003\n"));
    assert!(encoded.contains("event: task.created\n"));
}
