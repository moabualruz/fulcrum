use fulcrum_config::FulcrumPaths;
use fulcrum_setup::{CommandHostProbe, SetupPlanner, SetupProfile, UninstallOptions};
use fulcrum_storage::Storage;
use fulcrum_worker::complete_stub_run;
use std::env;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

fn main() {
    if let Err(err) = run(env::args().skip(1).collect()) {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    let paths = FulcrumPaths::discover();
    match args.first().map(String::as_str) {
        Some("init") => cmd_init(&paths),
        Some("up") => cmd_up(&paths),
        Some("down") => cmd_down(&paths),
        Some("status") => cmd_status(&paths),
        Some("doctor") => cmd_doctor(&paths),
        Some("project") => cmd_project(&paths, &args[1..]),
        Some("task") => cmd_task(&paths, &args[1..]),
        Some("run") => cmd_run(&paths, &args[1..]),
        Some("setup") => cmd_setup(&paths, &args[1..]),
        Some("artifact") => cmd_artifact(&paths, &args[1..]),
        Some("backup") => cmd_backup(&paths, &args[1..]),
        Some("restore") => cmd_restore(&args[1..]),
        Some("export") => cmd_export(&paths),
        Some("uninstall") => cmd_uninstall(&paths, &args[1..]),
        _ => {
            print_help();
            Ok(())
        }
    }
}

fn cmd_init(paths: &FulcrumPaths) -> Result<(), String> {
    paths.ensure()?;
    let storage = Storage::open(paths)?;
    let workspace = storage.ensure_default_workspace()?;
    println!("initialized home={}", paths.home.display());
    println!("config={}", paths.config.display());
    println!("db={}", paths.db.display());
    println!("workspace={}", workspace.id);
    Ok(())
}

fn cmd_up(paths: &FulcrumPaths) -> Result<(), String> {
    paths.ensure()?;
    Storage::open(paths)?.ensure_default_workspace()?;
    if let Some(pid) = paths.read_daemon_pid()
        && process_alive(pid)
    {
        println!("daemon=running");
        println!("pid={pid}");
        if let Some(endpoint) = paths.read_daemon_endpoint() {
            println!("endpoint={endpoint}");
        }
        println!("state={}", paths.daemon_state.display());
        return Ok(());
    }
    let daemon = daemon_binary()?;
    let log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.logs.join("daemon.log"))
        .map_err(|err| format!("failed to open daemon log: {err}"))?;
    let child = Command::new(&daemon)
        .arg("--serve")
        .env("FULCRUM_HOME", &paths.home)
        .stdin(Stdio::null())
        .stdout(
            log.try_clone()
                .map_err(|err| format!("failed to clone log: {err}"))?,
        )
        .stderr(log)
        .spawn()
        .map_err(|err| format!("failed to start {}: {err}", daemon.display()))?;
    paths.write_daemon_pid(child.id())?;
    for _ in 0..20 {
        if paths.read_daemon_endpoint().is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    if !process_alive(child.id()) {
        paths.write_daemon_state("stopped")?;
        return Err("daemon exited during startup".to_string());
    }
    println!("daemon=running");
    println!("pid={}", child.id());
    if let Some(endpoint) = paths.read_daemon_endpoint() {
        println!("endpoint={endpoint}");
    }
    println!("state={}", paths.daemon_state.display());
    Ok(())
}

fn cmd_down(paths: &FulcrumPaths) -> Result<(), String> {
    paths.ensure()?;
    if let Some(pid) = paths.read_daemon_pid()
        && process_alive(pid)
    {
        let _ = terminate_process(pid);
    }
    paths.write_daemon_state("stopped")?;
    println!("daemon=stopped");
    Ok(())
}

fn cmd_status(paths: &FulcrumPaths) -> Result<(), String> {
    if !paths.db.exists() {
        return Err(format!("not initialized: missing {}", paths.db.display()));
    }
    let storage = Storage::open(paths)?;
    let summary = storage.summary()?;
    println!("profile=core");
    println!("daemon={}", live_daemon_status(paths));
    println!("db={}", paths.db.display());
    println!("workspaces={}", summary.workspaces);
    println!("projects={}", summary.projects);
    println!("tasks={}", summary.tasks);
    println!("runs={}", summary.runs);
    println!("events={}", summary.events);
    Ok(())
}

fn cmd_doctor(paths: &FulcrumPaths) -> Result<(), String> {
    if !paths.config.exists() {
        println!("error config missing {}", paths.config.display());
        println!("fix run `fulcrum init`");
        return Ok(());
    }
    if !paths.db.exists() {
        println!("error db missing {}", paths.db.display());
        println!("fix run `fulcrum init`");
        return Ok(());
    }
    let storage = Storage::open(paths)?;
    let summary = storage.summary()?;
    println!("ok config {}", paths.config.display());
    println!("ok db {}", paths.db.display());
    println!("ok daemon {}", live_daemon_status(paths));
    println!("ok events {}", summary.events);
    println!("warning optional sidecars not enabled");
    Ok(())
}

fn cmd_project(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("add"), Some(path)) => {
            paths.ensure()?;
            let storage = Storage::open(paths)?;
            let name = Path::new(path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("project");
            let project = storage.add_project(path, name)?;
            println!("project={}", project.id);
            println!("path={}", project.path);
            Ok(())
        }
        _ => Err("usage: fulcrum project add <path>".to_string()),
    }
}

fn cmd_task(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("create"), Some(title)) => {
            paths.ensure()?;
            let task = Storage::open(paths)?.create_task(title)?;
            println!("task={}", task.id);
            println!("status={}", task.status);
            Ok(())
        }
        (Some("done"), Some(task_id)) => {
            paths.ensure()?;
            Storage::open(paths)?.task_done(task_id)?;
            println!("task={task_id}");
            println!("status=done");
            Ok(())
        }
        _ => Err("usage: fulcrum task create <title>".to_string()),
    }
}

fn cmd_run(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("start"), Some(task_id)) => {
            paths.ensure()?;
            let storage = Storage::open(paths)?;
            let run = storage.start_run(task_id, "stub")?;
            println!("run={}", run.id);
            println!("status=running");
            println!("stream=evt");
            Ok(())
        }
        (Some("complete"), Some(run_id)) => {
            paths.ensure()?;
            let result = complete_stub_run(paths, run_id)?;
            println!("run={run_id}");
            println!("status=completed");
            println!("artifact={}", result.artifact_path.display());
            Ok(())
        }
        (Some("block"), Some(run_id)) => {
            paths.ensure()?;
            let reason = args.get(2).map(String::as_str).unwrap_or("blocked");
            Storage::open(paths)?.block_run(run_id, reason)?;
            println!("run={run_id}");
            println!("status=blocked");
            Ok(())
        }
        (Some("heartbeat"), Some(run_id)) => {
            paths.ensure()?;
            let note = args.get(2).map(String::as_str).unwrap_or("alive");
            Storage::open(paths)?.heartbeat_run(run_id, note)?;
            println!("run={run_id}");
            println!("heartbeat=recorded");
            Ok(())
        }
        (Some("cancel"), Some(run_id)) => {
            paths.ensure()?;
            let reason = args.get(2).map(String::as_str).unwrap_or("canceled");
            Storage::open(paths)?.cancel_run(run_id, reason)?;
            println!("run={run_id}");
            println!("status=canceled");
            Ok(())
        }
        (Some("fail"), Some(run_id)) => {
            paths.ensure()?;
            let reason = args.get(2).map(String::as_str).unwrap_or("failed");
            Storage::open(paths)?.fail_run(run_id, reason)?;
            println!("run={run_id}");
            println!("status=failed");
            Ok(())
        }
        (Some("watch"), Some(run_id)) => {
            paths.ensure()?;
            watch_run(paths, run_id)
        }
        _ => Err(
            "usage: fulcrum run <start|complete|block|heartbeat|cancel|fail|watch> <id>"
                .to_string(),
        ),
    }
}

fn cmd_artifact(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("list"), Some(run_id)) => {
            paths.ensure()?;
            let artifacts = Storage::open(paths)?.list_artifacts(run_id)?;
            if artifacts.is_empty() {
                println!("artifacts=0");
            } else {
                for artifact in artifacts {
                    println!("{artifact}");
                }
            }
            Ok(())
        }
        _ => Err("usage: fulcrum artifact list <run>".to_string()),
    }
}

fn cmd_setup(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("plan"), Some(profile)) => {
            let profile = parse_profile(profile)?;
            let planner = SetupPlanner::for_current_host();
            let plan = planner.plan(profile);
            println!("profile={}", plan.profile);
            println!("host_os={}", plan.host.os.as_str());
            println!("host_arch={}", plan.host.arch.as_str());
            println!("dependencies={}", plan.dependencies.len());
            for dependency in &plan.dependencies {
                println!(
                    "dependency={} requirement={:?} kind={:?}",
                    dependency.id, dependency.requirement, dependency.kind
                );
            }
            for step in planner.dry_run(&plan).steps {
                println!("step={} command={}", step.id, step.command);
            }
            println!("certified={}", plan.certification.passed());
            Ok(())
        }
        (Some("doctor"), Some(profile)) => {
            let profile = parse_profile(profile)?;
            let planner = SetupPlanner::for_current_host();
            let report = planner.doctor(profile, &CommandHostProbe::new(paths.home.clone()));
            println!("profile={}", report.profile);
            for health in &report.health {
                println!(
                    "dependency={} status={:?} evidence={}",
                    health.dependency, health.status, health.evidence
                );
            }
            println!("doctor_passed={}", report.passed());
            if report.passed() {
                Ok(())
            } else {
                Err(format!("setup doctor failed for {profile}"))
            }
        }
        (Some("install"), Some(profile)) => {
            let profile = parse_profile(profile)?;
            let planner = SetupPlanner::for_current_host();
            let plan = planner.plan(profile);
            println!("install_mode=dry-run");
            println!("profile={}", plan.profile);
            for step in plan.steps.iter().chain(plan.health_checks.iter()) {
                println!("step={} command={}", step.id, step.command);
            }
            println!("certified={}", plan.certification.passed());
            Ok(())
        }
        (Some("uninstall"), Some(profile)) => {
            let profile = parse_profile(profile)?;
            let purge_backups = args.iter().any(|arg| arg == "--purge-backups");
            let planner = SetupPlanner::for_current_host();
            let plan = planner.uninstall_plan(
                profile,
                UninstallOptions {
                    preserve_backups: !purge_backups,
                },
            );
            println!("uninstall_mode=dry-run");
            println!("profile={}", plan.profile);
            println!("backups_preserved={}", plan.preserve_backups);
            for step in plan.steps {
                println!("step={} command={}", step.id, step.command);
            }
            Ok(())
        }
        _ => Err(
            "usage: fulcrum setup <plan|install|doctor|uninstall> <core|code|memory|actions|full>"
                .to_string(),
        ),
    }
}

fn cmd_backup(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    match args.first().map(String::as_str) {
        Some("create") => {
            paths.ensure()?;
            let storage = Storage::open(paths)?;
            let backup = storage.backup(paths)?;
            println!("backup={}", backup.display());
            Ok(())
        }
        _ => Err("usage: fulcrum backup create".to_string()),
    }
}

fn cmd_restore(args: &[String]) -> Result<(), String> {
    match (args.first().map(String::as_str), args.get(1)) {
        (Some("verify"), Some(path)) => {
            Storage::verify_backup(path)?;
            println!("backup=valid");
            Ok(())
        }
        (Some("apply"), Some(path)) => {
            let paths = FulcrumPaths::discover();
            paths.ensure()?;
            Storage::restore_backup(&paths, path)?;
            println!("backup=restored");
            println!("db={}", paths.db.display());
            Ok(())
        }
        _ => Err("usage: fulcrum restore verify <backup-path>".to_string()),
    }
}

fn cmd_export(paths: &FulcrumPaths) -> Result<(), String> {
    if !paths.db.exists() {
        return Err(format!("not initialized: missing {}", paths.db.display()));
    }
    let storage = Storage::open(paths)?;
    let summary = storage.summary()?;
    println!("fulcrum_export_version=1");
    println!("home={}", paths.home.display());
    println!("db={}", paths.db.display());
    println!("workspaces={}", summary.workspaces);
    println!("projects={}", summary.projects);
    println!("tasks={}", summary.tasks);
    println!("runs={}", summary.runs);
    println!("events={}", summary.events);
    Ok(())
}

fn cmd_uninstall(paths: &FulcrumPaths, args: &[String]) -> Result<(), String> {
    if !args.iter().any(|arg| arg == "--yes") {
        return Err("usage: fulcrum uninstall --yes [--purge-backups]".to_string());
    }
    let purge_backups = args.iter().any(|arg| arg == "--purge-backups");
    if let Some(pid) = paths.read_daemon_pid()
        && process_alive(pid)
    {
        let _ = terminate_process(pid);
    }
    paths.remove_managed_state(!purge_backups)?;
    println!("uninstalled=true");
    println!("home={}", paths.home.display());
    println!("backups_preserved={}", !purge_backups);
    Ok(())
}

fn print_help() {
    println!(
        "fulcrum <init|up|down|status|doctor|project|task|run|setup|artifact|backup|restore|export|uninstall>"
    );
}

fn parse_profile(value: &str) -> Result<SetupProfile, String> {
    match value {
        "core" => Ok(SetupProfile::Core),
        "code" => Ok(SetupProfile::Code),
        "memory" => Ok(SetupProfile::Memory),
        "actions" => Ok(SetupProfile::Actions),
        "full" => Ok(SetupProfile::Full),
        _ => Err(format!("unknown setup profile: {value}")),
    }
}

fn live_daemon_status(paths: &FulcrumPaths) -> String {
    match paths.read_daemon_pid() {
        Some(pid) if process_alive(pid) => match daemon_health(paths) {
            Some(health) => format!("running pid={pid} {health}"),
            None => format!("running pid={pid} health=unreachable"),
        },
        _ => "stopped".to_string(),
    }
}

fn watch_run(paths: &FulcrumPaths, run_id: &str) -> Result<(), String> {
    let mut printed = 0_usize;
    loop {
        let storage = Storage::open(paths)?;
        let events = storage.events_for_subject(run_id)?;
        for event in events.iter().skip(printed) {
            println!("{} {} {}", event.id, event.kind, event.subject);
        }
        printed = events.len();
        let status = storage.run_status(run_id)?;
        if matches!(
            status.as_str(),
            "completed" | "failed" | "canceled" | "blocked"
        ) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn daemon_health(paths: &FulcrumPaths) -> Option<String> {
    let endpoint = paths.read_daemon_endpoint()?;
    let response = http_get(&endpoint, "/health").ok()?;
    if response.contains("status=ok") {
        Some(format!("endpoint={endpoint} health=ok"))
    } else {
        Some(format!("endpoint={endpoint} health=degraded"))
    }
}

fn http_get(endpoint: &str, path: &str) -> Result<String, String> {
    let address = endpoint
        .strip_prefix("http://")
        .ok_or_else(|| format!("unsupported endpoint: {endpoint}"))?;
    let mut stream = TcpStream::connect(address)
        .map_err(|err| format!("failed to connect {endpoint}: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .map_err(|err| format!("failed to set read timeout: {err}"))?;
    stream
        .write_all(format!("GET {path} HTTP/1.1\r\nhost: {address}\r\n\r\n").as_bytes())
        .map_err(|err| format!("failed to write request: {err}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|err| format!("failed to read response: {err}"))?;
    Ok(response)
}

fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        return Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }
    #[cfg(windows)]
    {
        return Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}")])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .map(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())
            })
            .unwrap_or(false);
    }
    #[allow(unreachable_code)]
    false
}

fn terminate_process(pid: u32) -> std::io::Result<std::process::ExitStatus> {
    #[cfg(unix)]
    {
        return Command::new("kill").arg(pid.to_string()).status();
    }
    #[cfg(windows)]
    {
        return Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
    #[allow(unreachable_code)]
    Command::new("kill").arg(pid.to_string()).status()
}

fn daemon_binary() -> Result<std::path::PathBuf, String> {
    let current = env::current_exe().map_err(|err| format!("failed to find current exe: {err}"))?;
    let daemon = current.with_file_name("fulcrum-daemon");
    if daemon.exists() {
        Ok(daemon)
    } else {
        Err(format!(
            "daemon binary not found beside {}",
            current.display()
        ))
    }
}
