use fulcrum_events::EventKind;
use fulcrum_kernel::{Kernel, RunStatus, TaskStatus};

#[test]
fn creates_task_starts_run_emits_events_and_graph_links() {
    let mut kernel = Kernel::new();

    let workspace = kernel.create_workspace("local");
    let project = kernel
        .create_project(&workspace.id, "agent-os")
        .expect("project");
    let task = kernel
        .create_task(&workspace.id, &project.id, "validate spike harness")
        .expect("task");
    let run = kernel
        .start_run(&task.id, "software_engineer")
        .expect("run");

    assert_eq!(kernel.tasks()[0].status, TaskStatus::InProgress);
    assert_eq!(kernel.runs()[0].status, RunStatus::Running);
    assert_eq!(run.task_id, task.id);
    assert_eq!(kernel.events().len(), 4);
    assert_eq!(kernel.events()[3].kind, EventKind::RunStarted);
    assert_eq!(kernel.graph().edges().len(), 3);
}

#[test]
fn completing_run_finishes_the_task() {
    let mut kernel = Kernel::new();

    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let task = kernel
        .create_task(&workspace.id, &project.id, "finish run")
        .unwrap();
    let run = kernel.start_run(&task.id, "software_engineer").unwrap();

    let completed = kernel.complete_run(&run.id).unwrap();

    assert_eq!(completed.status, RunStatus::Completed);
    assert_eq!(kernel.tasks()[0].status, TaskStatus::Done);
    assert_eq!(
        kernel.events().last().unwrap().kind,
        EventKind::RunCompleted
    );
}

#[test]
fn lifecycle_events_include_replay_attributes() {
    let mut kernel = Kernel::new();

    let workspace = kernel.create_workspace("local");
    let project = kernel.create_project(&workspace.id, "agent-os").unwrap();
    let task = kernel
        .create_task(&workspace.id, &project.id, "replay state")
        .unwrap();
    let run = kernel.start_run(&task.id, "software_engineer").unwrap();
    kernel.complete_run(&run.id).unwrap();

    let summary = kernel.replay_summary();
    let task_event = kernel
        .events()
        .iter()
        .find(|event| event.kind == EventKind::TaskCreated)
        .unwrap();

    assert_eq!(summary.workspaces, 1);
    assert_eq!(summary.projects, 1);
    assert_eq!(summary.tasks, 1);
    assert_eq!(summary.runs_started, 1);
    assert_eq!(summary.runs_completed, 1);
    assert!(
        task_event
            .attributes
            .contains(&("title".to_string(), "replay state".to_string()))
    );
}
