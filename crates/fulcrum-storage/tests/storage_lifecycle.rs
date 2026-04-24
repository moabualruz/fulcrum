use fulcrum_config::FulcrumPaths;
use fulcrum_storage::Storage;
use std::fs;

#[test]
fn initializes_persists_task_run_and_backup() {
    let root = std::env::temp_dir().join(format!("fulcrum-storage-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let paths = FulcrumPaths::from_home(&root);
    paths.ensure().unwrap();
    let storage = Storage::open(&paths).unwrap();

    let workspace = storage.ensure_default_workspace().unwrap();
    let project = storage.add_project(".", "sample").unwrap();
    let task = storage.create_task("ship first run").unwrap();
    let run = storage.start_run(&task.id, "stub").unwrap();
    storage.heartbeat_run(&run.id, "working").unwrap();
    storage.complete_run(&run.id).unwrap();
    let canceled_task = storage.create_task("cancel path").unwrap();
    let canceled_run = storage.start_run(&canceled_task.id, "stub").unwrap();
    storage
        .cancel_run(&canceled_run.id, "operator canceled")
        .unwrap();
    let failed_task = storage.create_task("fail path").unwrap();
    let failed_run = storage.start_run(&failed_task.id, "stub").unwrap();
    storage.fail_run(&failed_run.id, "worker failed").unwrap();
    let backup = storage.backup(&paths).unwrap();

    assert_eq!(workspace.id, "ws_000001");
    assert_eq!(project.id, "proj_000001");
    assert_eq!(task.id, "task_000001");
    assert_eq!(run.id, "run_000001");
    assert!(backup.exists());
    assert!(backup.with_extension("db.manifest").exists());
    assert!(storage.summary().unwrap().events >= 5);
    Storage::verify_backup(backup.to_str().unwrap()).unwrap();
    let restore_root = root.with_extension("restore");
    let _ = fs::remove_dir_all(&restore_root);
    let restore_paths = FulcrumPaths::from_home(&restore_root);
    Storage::restore_backup(&restore_paths, backup.to_str().unwrap()).unwrap();
    assert!(restore_paths.db.exists());
    assert!(storage.start_run("task_missing", "stub").is_err());
    assert!(storage.complete_run("run_missing").is_err());
    assert!(storage.cancel_run(&run.id, "too late").is_err());
    assert!(storage.heartbeat_run("run_missing", "nope").is_err());

    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&restore_root);
}
