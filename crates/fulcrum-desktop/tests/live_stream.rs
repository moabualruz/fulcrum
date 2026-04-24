use fulcrum_desktop::{LiveEventDto, append_live_event, build_snapshot, render_dashboard};
use fulcrum_kernel::Kernel;

#[test]
fn cockpit_snapshot_shows_global_project_board_runs_blockers_and_health() {
    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let backend = kernel.create_project(&workspace.id, "backend").unwrap();
    let open = kernel
        .create_task(&workspace.id, &project.id, "draft board")
        .unwrap();
    let running = kernel
        .create_task(&workspace.id, &project.id, "ship cockpit")
        .unwrap();
    let blocked = kernel
        .create_task(&workspace.id, &backend.id, "wire adapter")
        .unwrap();
    let done = kernel
        .create_task(&workspace.id, &project.id, "snapshot shell")
        .unwrap();
    let running_run = kernel.start_run(&running.id, "software_engineer").unwrap();
    let blocked_run = kernel.start_run(&blocked.id, "reviewer").unwrap();
    kernel
        .block_run(&blocked_run.id, "Needs policy approval")
        .unwrap();
    let done_run = kernel.start_run(&done.id, "software_engineer").unwrap();
    kernel.complete_run(&done_run.id).unwrap();

    let before_events = kernel.events().len();
    let snapshot = build_snapshot(&kernel);
    let dashboard = render_dashboard(&snapshot);

    assert_eq!(snapshot.tasks_open, 1);
    assert_eq!(snapshot.tasks_running, 1);
    assert_eq!(snapshot.tasks_done, 1);
    assert_eq!(snapshot.active_runs, 1);
    assert_eq!(snapshot.summary.tasks_blocked, 1);
    assert_eq!(snapshot.task_board.global.open[0].id, open.id);
    assert!(
        snapshot
            .task_board
            .projects
            .iter()
            .any(|project| project.project_name == "agent-os" && project.columns.running.len() == 1)
    );
    assert!(
        snapshot
            .task_board
            .projects
            .iter()
            .any(|project| project.project_name == "backend" && project.columns.blocked.len() == 1)
    );
    assert!(
        snapshot
            .active_run_cards
            .iter()
            .any(|run| run.id == running_run.id && run.status == "running")
    );
    assert!(
        snapshot
            .blockers
            .iter()
            .any(|blocker| blocker.detail == "Needs policy approval")
    );
    assert_eq!(snapshot.health.len(), 5);
    assert!(
        snapshot
            .adapter_health
            .iter()
            .any(|health| health.key == "plane")
    );
    assert!(snapshot.event_count >= 10);
    assert_eq!(kernel.events().len(), before_events);
    assert!(dashboard.contains("open=1 running=1 blocked=1 done=1"));
    assert!(dashboard.contains("backend open=0 running=0 blocked=1 done=0 failed=0"));
    assert!(dashboard.contains("health:degraded"));
}

#[test]
fn live_event_append_updates_runs_artifacts_policy_and_queues() {
    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let task = kernel
        .create_task(&workspace.id, &project.id, "ship cockpit")
        .unwrap();
    let run = kernel.start_run(&task.id, "software_engineer").unwrap();
    let mut snapshot = build_snapshot(&kernel);

    append_live_event(
        &mut snapshot,
        event(
            "evt_900001",
            "run.heartbeat",
            &run.id,
            "rendering queue model",
            &[("task_id", task.id.as_str()), ("status", "running")],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_900002",
            "artifact.created",
            "artifact_1",
            "/tmp/run.patch",
            &[
                ("run_id", run.id.as_str()),
                ("task_id", task.id.as_str()),
                ("kind", "patch"),
                ("path", "/tmp/run.patch"),
                ("state", "ready"),
            ],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_900003",
            "review.requested",
            "review_1",
            "needs review",
            &[
                ("task_id", task.id.as_str()),
                ("run_id", run.id.as_str()),
                ("title", "ship cockpit"),
                ("reviewer", "human"),
            ],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_900004",
            "review.approved",
            "review_1",
            "approved",
            &[("task_id", task.id.as_str()), ("title", "ship cockpit")],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_900005",
            "merge.ready",
            "merge_1",
            "ready",
            &[
                ("task_id", task.id.as_str()),
                ("run_id", run.id.as_str()),
                ("title", "ship cockpit"),
                ("target", "main"),
            ],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_900006",
            "policy.decision",
            "policy_1",
            "terminal runs cannot transition",
            &[
                ("subject_kind", "run"),
                ("subject_id", run.id.as_str()),
                ("allowed", "false"),
                ("reason", "terminal runs cannot transition"),
            ],
        ),
    );

    let dashboard = render_dashboard(&snapshot);

    assert_eq!(
        snapshot.active_run_cards[0].note.as_deref(),
        Some("rendering queue model")
    );
    assert_eq!(snapshot.artifacts[0].path, "/tmp/run.patch");
    assert_eq!(snapshot.review_queue.len(), 1);
    assert_eq!(snapshot.review_queue[0].status, "approved");
    assert_eq!(snapshot.merge_queue[0].status, "ready");
    assert!(!snapshot.policy_decisions[0].allowed);
    assert!(dashboard.contains("artifact:artifact_1:ready:patch:/tmp/run.patch"));
    assert!(dashboard.contains("review:review_1:approved:ship cockpit"));
    assert!(dashboard.contains("merge:merge_1:ready:ship cockpit"));
    assert_eq!(snapshot.policy_decisions[0].subject_id, run.id);
    assert!(dashboard.contains("policy:policy_1:denied:run:"));
    assert!(dashboard.contains("terminal runs cannot transition"));
}

#[test]
fn degradation_and_terminal_events_update_display_state() {
    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let task = kernel
        .create_task(&workspace.id, &project.id, "close run")
        .unwrap();
    let run = kernel.start_run(&task.id, "software_engineer").unwrap();
    let mut snapshot = build_snapshot(&kernel);

    append_live_event(
        &mut snapshot,
        event(
            "evt_910001",
            "adapter.health_checked",
            "zoekt",
            "index lag high",
            &[("status", "degraded")],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_910002",
            "merge.blocked",
            "merge_1",
            "checks pending",
            &[
                ("task_id", task.id.as_str()),
                ("title", "close run"),
                ("target", "main"),
                ("reason", "checks pending"),
            ],
        ),
    );
    append_live_event(
        &mut snapshot,
        event(
            "evt_910003",
            "run.completed",
            &run.id,
            "run completed",
            &[("task_id", task.id.as_str()), ("status", "completed")],
        ),
    );

    let dashboard = render_dashboard(&snapshot);

    assert_eq!(
        snapshot
            .adapter_health
            .iter()
            .find(|health| health.key == "zoekt")
            .unwrap()
            .status,
        "degraded"
    );
    assert!(snapshot.active_run_cards.is_empty());
    assert_eq!(snapshot.task_board.global.done[0].id, task.id);
    assert_eq!(snapshot.merge_queue[0].status, "blocked");
    assert!(dashboard.contains("zoekt:degraded index lag high"));
    assert!(dashboard.contains("merge:merge_1:blocked:close run"));
}

fn event(
    id: &str,
    kind: &str,
    subject: &str,
    message: &str,
    attributes: &[(&str, &str)],
) -> LiveEventDto {
    LiveEventDto {
        id: id.to_string(),
        kind: kind.to_string(),
        subject: subject.to_string(),
        message: message.to_string(),
        at_ms: 1_700_000_000_000,
        attributes: attributes
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
    }
}
