use std::process::Command;

#[test]
fn init_project_task_run_backup_smoke() {
    let root = std::env::temp_dir().join(format!("fulcrum-cli-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let bin = env!("CARGO_BIN_EXE_fulcrum");

    assert_cmd(bin, &root, &["init"], "workspace=ws_000001");
    assert_cmd(bin, &root, &["up"], "daemon=running");
    assert_cmd(bin, &root, &["project", "add", "."], "project=proj_000001");
    assert_cmd(
        bin,
        &root,
        &["task", "create", "Smoke task"],
        "task=task_000001",
    );
    assert_cmd(
        bin,
        &root,
        &["run", "start", "task_000001"],
        "run=run_000001",
    );
    assert_cmd(
        bin,
        &root,
        &["run", "heartbeat", "run_000001", "working"],
        "heartbeat=recorded",
    );
    assert_cmd(
        bin,
        &root,
        &["run", "complete", "run_000001"],
        "status=completed",
    );
    assert_cmd(bin, &root, &["run", "watch", "run_000001"], "run.started");
    assert_cmd(bin, &root, &["run", "watch", "run_000001"], "run.completed");
    assert_cmd(
        bin,
        &root,
        &["artifact", "list", "run_000001"],
        "stub-result.txt",
    );
    assert_cmd(bin, &root, &["task", "done", "task_000001"], "status=done");
    assert_cmd(bin, &root, &["status"], "health=ok");
    assert_cmd(
        bin,
        &root,
        &["doctor"],
        "warning optional sidecars not enabled",
    );
    assert_cmd(
        bin,
        &root,
        &["setup", "plan", "full"],
        "dependency=lightrag",
    );
    assert_cmd(
        bin,
        &root,
        &["setup", "install", "code"],
        "install_mode=dry-run",
    );
    assert_cmd(
        bin,
        &root,
        &["setup", "doctor", "core"],
        "doctor_passed=true",
    );
    assert_cmd_fails(
        bin,
        &root,
        &["setup", "doctor", "memory"],
        "setup doctor failed for memory",
    );
    assert_cmd(
        bin,
        &root,
        &["setup", "uninstall", "actions"],
        "backups_preserved=true",
    );
    assert_cmd_fails(
        bin,
        &root,
        &["run", "start", "task_missing"],
        "task not found",
    );
    assert_cmd(
        bin,
        &root,
        &["task", "create", "Canceled task"],
        "task=task_000002",
    );
    assert_cmd(
        bin,
        &root,
        &["run", "start", "task_000002"],
        "run=run_000002",
    );
    assert_cmd(
        bin,
        &root,
        &["run", "cancel", "run_000002", "operator canceled"],
        "status=canceled",
    );
    let backup = output_cmd(bin, &root, &["backup", "create"]);
    let backup_path = backup
        .lines()
        .find_map(|line| line.strip_prefix("backup="))
        .expect("backup path");
    assert_cmd(
        bin,
        &root,
        &["restore", "verify", backup_path],
        "backup=valid",
    );
    let restore_root = root.with_extension("restore");
    let _ = std::fs::remove_dir_all(&restore_root);
    assert_cmd(
        bin,
        &restore_root,
        &["restore", "apply", backup_path],
        "backup=restored",
    );
    assert_cmd(bin, &root, &["export"], "fulcrum_export_version=1");
    assert_cmd(bin, &root, &["down"], "daemon=stopped");
    assert_cmd_fails(bin, &root, &["uninstall"], "usage: fulcrum uninstall --yes");
    assert_cmd(
        bin,
        &root,
        &["uninstall", "--yes"],
        "backups_preserved=true",
    );
    assert!(root.join("backups").exists());
    assert!(!root.join("fulcrum.db").exists());

    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&restore_root);
}

fn assert_cmd(bin: &str, root: &std::path::Path, args: &[&str], expected: &str) {
    let output = Command::new(bin)
        .args(args)
        .env("FULCRUM_HOME", root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "command {:?} failed\nstdout:\n{}\nstderr:\n{}",
        args,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains(expected),
        "command {:?} expected {:?}, got:\n{}",
        args,
        expected,
        stdout
    );
}

fn output_cmd(bin: &str, root: &std::path::Path, args: &[&str]) -> String {
    let output = Command::new(bin)
        .args(args)
        .env("FULCRUM_HOME", root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "command {:?} failed\nstdout:\n{}\nstderr:\n{}",
        args,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn assert_cmd_fails(bin: &str, root: &std::path::Path, args: &[&str], expected: &str) {
    let output = Command::new(bin)
        .args(args)
        .env("FULCRUM_HOME", root)
        .output()
        .unwrap();
    assert!(
        !output.status.success(),
        "command {:?} unexpectedly succeeded\nstdout:\n{}\nstderr:\n{}",
        args,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains(expected),
        "command {:?} expected stderr {:?}, got:\n{}",
        args,
        expected,
        stderr
    );
}
