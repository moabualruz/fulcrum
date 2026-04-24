use fulcrum_config::FulcrumPaths;
use fulcrum_storage::Storage;
use fulcrum_worker::complete_stub_run;

#[test]
fn stub_worker_owns_artifact_and_completion() {
    let root = std::env::temp_dir().join(format!("fulcrum-worker-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let paths = FulcrumPaths::from_home(&root);
    paths.ensure().unwrap();
    let storage = Storage::open(&paths).unwrap();
    storage.ensure_default_workspace().unwrap();
    storage.add_project(".", "sample").unwrap();
    let task = storage.create_task("ship worker").unwrap();
    let run = storage.start_run(&task.id, "stub").unwrap();

    let result = complete_stub_run(&paths, &run.id).unwrap();

    assert!(result.artifact_path.exists());
    assert_eq!(
        storage
            .events_for_subject(&run.id)
            .unwrap()
            .last()
            .unwrap()
            .kind,
        "run.completed"
    );

    let _ = std::fs::remove_dir_all(&root);
}
