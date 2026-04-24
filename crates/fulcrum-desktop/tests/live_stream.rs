use fulcrum_desktop::build_snapshot;
use fulcrum_kernel::Kernel;

#[test]
fn cockpit_snapshot_shows_live_task_run_and_health_state() {
    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let task = kernel
        .create_task(&workspace.id, &project.id, "show live run")
        .unwrap();
    kernel.start_run(&task.id, "software_engineer").unwrap();

    let before_events = kernel.events().len();
    let snapshot = build_snapshot(&kernel);

    assert_eq!(snapshot.tasks_running, 1);
    assert_eq!(snapshot.active_runs, 1);
    assert_eq!(snapshot.health.len(), 5);
    assert!(snapshot.health.iter().any(|health| health.key == "plane"));
    assert!(
        snapshot
            .health
            .iter()
            .any(|health| health.key == "windmill")
    );
    assert!(
        snapshot
            .health
            .iter()
            .any(|health| health.key == "lightrag")
    );
    assert!(snapshot.health.iter().any(|health| health.key == "zoekt"));
    assert!(snapshot.health.iter().any(|health| health.key == "lancedb"));
    assert!(snapshot.event_count >= 4);
    assert_eq!(kernel.events().len(), before_events);
}
