mod cache;

use cache::CacheStore;
use inference_core::protocol::{CacheStats, HealthResult, Request, Response};
use std::env;
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", VERSION);
        return;
    }

    let home = env::var("FULCRUM_HOME").ok();
    if let Some(path) = cache_path(home.as_deref()) {
        if let Err(error) = CacheStore::open(&path) {
            eprintln!("warn: cache bootstrap failed ({}): {}", path.display(), error);
        }
    }
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
    if args.iter().any(|a| a == "--socket") {
        return match fulcrum_home.filter(|h| !h.is_empty()) {
            Some(home) => Transport::Socket(format!("{}/inference.sock", home)),
            None => Transport::Stdio,
        };
    }

    if args.iter().any(|a| a == "--stdio") || stdin_stream {
        return Transport::Stdio;
    }

    match fulcrum_home.filter(|h| !h.is_empty()) {
        Some(home) => Transport::Socket(format!("{}/inference.sock", home)),
        None => Transport::Stdio,
    }
}

fn cache_path(fulcrum_home: Option<&str>) -> Option<PathBuf> {
    fulcrum_home
        .filter(|h| !h.is_empty())
        .map(|home| PathBuf::from(home).join("inference-cache.db"))
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
                    loop {
                        match read_socket_frame(&mut reader).await {
                            Ok(Some(SocketFrame::Line(line))) => {
                                let response = dispatch_line(&line);
                                let mut out = serde_json::to_string(&response).unwrap_or_default();
                                out.push('\n');
                                if write_half.write_all(out.as_bytes()).await.is_err() {
                                    break;
                                }
                            }
                            Ok(Some(SocketFrame::LengthPrefixed(line))) => {
                                let response = dispatch_line(&line);
                                let out = encode_length_prefixed_response(&response);
                                if write_half.write_all(&out).await.is_err() {
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                });
            }
            Err(e) => eprintln!("accept error: {}", e),
        }
    }
}

enum SocketFrame {
    Line(String),
    LengthPrefixed(String),
}

async fn read_socket_frame<R>(reader: &mut BufReader<R>) -> std::io::Result<Option<SocketFrame>>
where
    R: AsyncRead + Unpin,
{
    let pending = reader.fill_buf().await?;
    if pending.is_empty() {
        return Ok(None);
    }

    if pending[0] == b'{' || pending[0].is_ascii_whitespace() {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            return Ok(None);
        }
        return Ok(Some(SocketFrame::Line(line)));
    }

    let mut header = [0_u8; 4];
    reader.read_exact(&mut header).await?;
    let len = u32::from_be_bytes(header) as usize;
    if len > MAX_FRAME_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    let mut body = vec![0_u8; len];
    reader.read_exact(&mut body).await?;
    let text = String::from_utf8(body)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(Some(SocketFrame::LengthPrefixed(text)))
}

fn encode_length_prefixed_response(response: &Response) -> Vec<u8> {
    let body = serde_json::to_vec(response).unwrap_or_default();
    let mut out = Vec::with_capacity(body.len() + 4);
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    out.extend_from_slice(&body);
    out
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
                cache: health_cache_stats(),
            },
        ),
        _ => Response::method_not_found(req.id),
    }
}

fn health_cache_stats() -> Option<CacheStats> {
    let path = cache_path(env::var("FULCRUM_HOME").ok().as_deref())?;
    let store = CacheStore::open(&path).ok()?;
    let stats = store.stats().ok()?;
    Some(CacheStats {
        db_path: stats.db_path,
        embed_rows: stats.embed_rows,
        gen_rows: stats.gen_rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::{CacheStore, EmbedCacheEntry, GenerateCacheEntry};
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_cache_path(name: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("fulcrum-{name}-{unique}.db"))
    }

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
    fn choose_transport_socket_flag_overrides_stream_stdin() {
        let args = vec!["inference-server".to_string(), "--socket".to_string()];
        assert_eq!(
            choose_transport(&args, true, Some("/tmp/fulcrum")),
            Transport::Socket("/tmp/fulcrum/inference.sock".to_string())
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

    #[test]
    fn cache_store_round_trips_embed_and_generate_entries_with_ttl() {
        let path = temp_cache_path("cache-roundtrip");
        let store = CacheStore::open(&path).unwrap();
        let now = CacheStore::now_epoch_seconds();

        let embed = EmbedCacheEntry {
            model: "bge-small-en-v1.5".to_string(),
            input_hash: "embed-hash".to_string(),
            dims: 3,
            vector: vec![0.1, 0.2, 0.3],
            expires_at: now + 60,
        };
        store.put_embed(&embed).unwrap();
        assert_eq!(store.get_embed("bge-small-en-v1.5", "embed-hash").unwrap(), Some(embed));

        let expired_embed = EmbedCacheEntry {
            model: "bge-small-en-v1.5".to_string(),
            input_hash: "old-embed".to_string(),
            dims: 3,
            vector: vec![0.0, 0.0, 0.0],
            expires_at: now - 1,
        };
        store.put_embed(&expired_embed).unwrap();
        assert_eq!(store.get_embed("bge-small-en-v1.5", "old-embed").unwrap(), None);

        let gen = GenerateCacheEntry {
            model: "qwen2.5-0.5b".to_string(),
            prompt_hash: "prompt-hash".to_string(),
            options_hash: "options-hash".to_string(),
            text: "Paris".to_string(),
            tokens: 1,
            expires_at: now + 60,
        };
        store.put_generate(&gen).unwrap();
        assert_eq!(
            store
                .get_generate("qwen2.5-0.5b", "prompt-hash", "options-hash")
                .unwrap(),
            Some(gen)
        );

        let stats = store.stats().unwrap();
        assert_eq!(stats.db_path, path.to_string_lossy());
        assert_eq!(stats.embed_rows, 1);
        assert_eq!(stats.gen_rows, 1);

        let _ = std::fs::remove_file(path);
    }
}
