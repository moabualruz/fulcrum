use fulcrum_config::FulcrumPaths;
use fulcrum_kernel::Kernel;
use fulcrum_storage::Storage;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

fn main() {
    if std::env::args().any(|arg| arg == "--serve") {
        if let Err(err) = serve() {
            eprintln!("fulcrum-daemon failed: {err}");
            std::process::exit(1);
        }
        return;
    }

    let mut kernel = Kernel::new();
    let workspace = kernel.create_workspace("local");
    let project = kernel
        .create_project(&workspace.id, "agent-os")
        .expect("bootstrap project");
    let task = kernel
        .create_task(&workspace.id, &project.id, "daemon smoke task")
        .expect("bootstrap task");
    kernel
        .start_run(&task.id, "software_engineer")
        .expect("bootstrap run");
    let snapshot = kernel.operator_snapshot();

    println!(
        "fulcrum-daemon ready tasks_running={} active_runs={} health_items={} events={}",
        snapshot.tasks_running,
        snapshot.active_runs,
        snapshot.health.len(),
        snapshot.event_count
    );
}

fn serve() -> Result<(), String> {
    let paths = FulcrumPaths::discover();
    paths.ensure()?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("failed to bind daemon health endpoint: {err}"))?;
    let endpoint = format!(
        "http://{}",
        listener
            .local_addr()
            .map_err(|err| format!("failed to read daemon endpoint: {err}"))?
    );
    paths.write_daemon_pid(std::process::id())?;
    paths.write_daemon_state_with_endpoint("running", Some(&endpoint))?;

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let _ = handle_connection(&paths, &mut stream);
            }
            Err(err) => eprintln!("fulcrum-daemon connection failed: {err}"),
        }
    }
    Ok(())
}

fn handle_connection(paths: &FulcrumPaths, stream: &mut TcpStream) -> Result<(), String> {
    let mut buffer = [0_u8; 2048];
    let size = stream
        .read(&mut buffer)
        .map_err(|err| format!("failed to read daemon request: {err}"))?;
    let request = String::from_utf8_lossy(&buffer[..size]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    match path {
        "/health" => write_response(stream, "200 OK", "text/plain", &health_body(paths)),
        path if path.starts_with("/events?once=1") => write_response(
            stream,
            "200 OK",
            "text/event-stream",
            &events_body(paths, 0),
        ),
        path if path.starts_with("/events") => write_event_stream(paths, stream),
        _ => write_response(stream, "404 Not Found", "text/plain", "not_found\n"),
    }
}

fn health_body(paths: &FulcrumPaths) -> String {
    match Storage::open(paths).and_then(|storage| storage.summary()) {
        Ok(summary) => format!(
            "status=ok\nprofile=core\ndb={}\nevents={}\ntasks={}\nruns={}\n",
            paths.db.display(),
            summary.events,
            summary.tasks,
            summary.runs
        ),
        Err(err) => format!("status=degraded\nerror={err}\n"),
    }
}

fn events_body(paths: &FulcrumPaths, skip: usize) -> String {
    match Storage::open(paths).and_then(|storage| storage.events()) {
        Ok(events) => events
            .iter()
            .skip(skip)
            .map(|event| {
                format!(
                    "id: {}\nevent: {}\ndata: subject={} message={}{}\n\n",
                    event.id,
                    event.kind,
                    event.subject,
                    event.message,
                    event
                        .attributes
                        .iter()
                        .map(|(key, value)| format!(" attr.{key}={}", escape_sse_value(value)))
                        .collect::<String>()
                )
            })
            .collect::<Vec<_>>()
            .join(""),
        Err(err) => format!("event: error\ndata: {err}\n\n"),
    }
}

fn escape_sse_value(value: &str) -> String {
    value
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('\n', "%0A")
        .replace('=', "%3D")
}

fn write_event_stream(paths: &FulcrumPaths, stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(
            b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\nconnection: close\r\n\r\n",
        )
        .map_err(|err| format!("failed to write daemon stream headers: {err}"))?;
    let mut sent = 0_usize;
    for _ in 0..120 {
        let body = events_body(paths, sent);
        if !body.is_empty() {
            stream
                .write_all(body.as_bytes())
                .and_then(|_| stream.flush())
                .map_err(|err| format!("failed to write daemon event stream: {err}"))?;
            sent += body.matches("\nid: ").count();
            if body.starts_with("id: ") {
                sent += 1;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    Ok(())
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|err| format!("failed to write daemon response: {err}"))
}
