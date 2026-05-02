use inference_core::protocol::{HealthResult, Request, Response};
use std::env;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", VERSION);
        return;
    }

    let home = env::var("FULCRUM_HOME").ok();
    match choose_transport(&args, stdin_is_stream(), home.as_deref()) {
        Transport::Socket(path) => {
            // Remove stale socket from a previous run.
            let _ = std::fs::remove_file(&path);
            match UnixListener::bind(&path) {
                Ok(listener) => run_socket_server(listener).await,
                Err(e) => {
                    eprintln!("warn: socket bind failed ({}), falling back to stdio", e);
                    run_stdio().await;
                }
            }
        }
        Transport::Stdio => run_stdio().await,
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Transport {
    Stdio,
    Socket(String),
}

fn choose_transport(args: &[String], stdin_stream: bool, fulcrum_home: Option<&str>) -> Transport {
    if args.iter().any(|a| a == "--stdio") || stdin_stream {
        return Transport::Stdio;
    }

    match fulcrum_home.filter(|h| !h.is_empty()) {
        Some(home) => Transport::Socket(format!("{}/inference.sock", home)),
        None => Transport::Stdio,
    }
}

#[cfg(unix)]
fn stdin_is_stream() -> bool {
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    let rc = unsafe { libc::fstat(libc::STDIN_FILENO, stat.as_mut_ptr()) };
    if rc != 0 {
        return false;
    }

    let stat = unsafe { stat.assume_init() };
    let mode = stat.st_mode & libc::S_IFMT;
    mode == libc::S_IFIFO || mode == libc::S_IFREG || mode == libc::S_IFSOCK
}

#[cfg(not(unix))]
fn stdin_is_stream() -> bool {
    false
}

async fn run_socket_server(listener: UnixListener) {
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tokio::spawn(async move {
                    let (read_half, mut write_half) = stream.into_split();
                    let mut reader = BufReader::new(read_half);
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let response = dispatch_line(&line);
                                let mut out =
                                    serde_json::to_string(&response).unwrap_or_default();
                                out.push('\n');
                                if write_half.write_all(out.as_bytes()).await.is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                });
            }
            Err(e) => eprintln!("accept error: {}", e),
        }
    }
}

async fn run_stdio() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let mut reader = BufReader::new(stdin);
    let mut writer = tokio::io::BufWriter::new(stdout);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                let response = dispatch_line(&line);
                let mut out = serde_json::to_string(&response).unwrap_or_default();
                out.push('\n');
                let _ = writer.write_all(out.as_bytes()).await;
                let _ = writer.flush().await;
            }
            Err(_) => break,
        }
    }
}

fn dispatch_line(line: &str) -> Response {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Response::error(None, -32700, "Parse error");
    }
    match serde_json::from_str::<Request>(trimmed) {
        Ok(req) => dispatch(req),
        Err(_) => Response::error(None, -32700, "Parse error"),
    }
}

fn dispatch(req: Request) -> Response {
    match req.method.as_str() {
        "health" => Response::success(
            req.id,
            HealthResult {
                status: "ok".to_string(),
                backends: vec![],
                models: vec![],
            },
        ),
        _ => Response::method_not_found(req.id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn dispatch_health_returns_ok_shape() {
        let line = r#"{"jsonrpc":"2.0","id":1,"method":"health","params":{}}"#;
        let resp = dispatch_line(line);
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 1);
        assert_eq!(val["result"]["status"], "ok");
        assert_eq!(val["result"]["backends"], json!([]));
        assert_eq!(val["result"]["models"], json!([]));
        assert!(val.get("error").is_none() || val["error"].is_null());
    }

    #[test]
    fn dispatch_unknown_method_returns_minus_32601() {
        let line = r#"{"jsonrpc":"2.0","id":2,"method":"foobar","params":{}}"#;
        let resp = dispatch_line(line);
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["error"]["code"], -32601);
        assert_eq!(val["error"]["message"], "Method not found");
        assert!(val.get("result").is_none() || val["result"].is_null());
    }

    #[test]
    fn dispatch_malformed_json_returns_parse_error() {
        let resp = dispatch_line("not-json");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["error"]["code"], -32700);
    }

    #[test]
    fn dispatch_empty_line_returns_parse_error() {
        let resp = dispatch_line("   ");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["error"]["code"], -32700);
    }

    #[test]
    fn choose_transport_prefers_stdio_flag_over_fulcrum_home() {
        let args = vec!["inference-server".to_string(), "--stdio".to_string()];
        assert_eq!(
            choose_transport(&args, false, Some("/tmp/fulcrum")),
            Transport::Stdio
        );
    }

    #[test]
    fn choose_transport_prefers_pending_stdin_over_fulcrum_home() {
        let args = vec!["inference-server".to_string()];
        assert_eq!(
            choose_transport(&args, true, Some("/tmp/fulcrum")),
            Transport::Stdio
        );
    }

    #[test]
    fn choose_transport_uses_socket_when_fulcrum_home_has_no_stdin() {
        let args = vec!["inference-server".to_string()];
        assert_eq!(
            choose_transport(&args, false, Some("/tmp/fulcrum")),
            Transport::Socket("/tmp/fulcrum/inference.sock".to_string())
        );
    }
}
