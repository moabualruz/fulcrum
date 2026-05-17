mod cache;
mod models;

use cache::CacheStore;
use inference_core::protocol::{CacheStats, HealthResult, Request, Response};
use inference_embed::classify::{ClassificationScore, ClassifyRequest};
use inference_embed::{EmbedRequest, EmbedResponse, DEFAULT_EMBED_DIMS, DEFAULT_EMBED_MODEL};
use inference_generate::tokenize::{TokenizeRequest, TokenizeResponse};
use inference_generate::{generate as generate_text, GenerateRequest, GenerateResponse};
use models::ModelPullParams;
use sha2::{Digest, Sha256};
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
            eprintln!(
                "warn: cache bootstrap failed ({}): {}",
                path.display(),
                error
            );
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
                models: model_ids(),
                cache: health_cache_stats(),
            },
        ),
        "embed" => match handle_embed(req.params) {
            Ok(response) => Response::success(req.id, response),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "classify" => match handle_classify(req.params) {
            Ok(response) => Response::success(req.id, response),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "tokenize" => match handle_tokenize(req.params) {
            Ok(response) => Response::success(req.id, response),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "models.list" => match handle_models_list() {
            Ok(models) => Response::success(req.id, models),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "models.pull" => match handle_models_pull(req.params) {
            Ok(events) => Response::success(req.id, events),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "models.rm" => match handle_models_rm(req.params) {
            Ok(payload) => Response::success(req.id, payload),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        "generate" => match handle_generate(req.params) {
            Ok(response) => Response::success(req.id, response),
            Err(message) => Response::error(req.id, -32602, &message),
        },
        _ => Response::method_not_found(req.id),
    }
}

fn model_ids() -> Vec<String> {
    models::manager_from_env()
        .map(|manager| manager.list().into_iter().map(|model| model.id).collect())
        .unwrap_or_default()
}

fn handle_models_list() -> Result<Vec<models::InferenceModelInfo>, String> {
    Ok(models::manager_from_env()
        .map_err(|error| error.to_string())?
        .list())
}

fn handle_models_pull(
    params: serde_json::Value,
) -> Result<Vec<models::ModelDownloadProgress>, String> {
    let request: ModelPullParams =
        serde_json::from_value(params).map_err(|error| error.to_string())?;
    models::manager_from_env()
        .map_err(|error| error.to_string())?
        .ensure(&request.model_id, request.force)
        .map_err(|error| error.to_string())
}

fn handle_models_rm(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let request: ModelPullParams =
        serde_json::from_value(params).map_err(|error| error.to_string())?;
    let removed = models::manager_from_env()
        .map_err(|error| error.to_string())?
        .remove(&request.model_id)
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "ok": true, "removed": removed }))
}

fn handle_embed(params: serde_json::Value) -> Result<EmbedResponse, String> {
    let request: EmbedRequest =
        serde_json::from_value(params).map_err(|error| error.to_string())?;
    if request.texts.is_empty() {
        return Err("embed requires at least one text".to_string());
    }
    let model = request
        .model
        .clone()
        .unwrap_or_else(|| DEFAULT_EMBED_MODEL.to_string());
    let input_hash = embed_input_hash(&request.texts);

    if let Some(store) = open_cache_store() {
        if let Ok(Some(entry)) = store.get_embed(&model, &input_hash) {
            return Ok(EmbedResponse {
                vectors: entry.vectors,
                model,
                cached: true,
            });
        }

        let response = inference_embed::embed(request)?;
        let dims = response
            .vectors
            .first()
            .map(|vector| vector.len())
            .unwrap_or(DEFAULT_EMBED_DIMS) as i64;
        let entry = cache::EmbedCacheEntry {
            model: response.model.clone(),
            input_hash,
            dims,
            vectors: response.vectors.clone(),
            expires_at: CacheStore::now_epoch_seconds() + 7 * 24 * 60 * 60,
            hit_count: 0,
        };
        let _ = store.put_embed(&entry);
        return Ok(response);
    }

    inference_embed::embed(request)
}

fn handle_classify(params: serde_json::Value) -> Result<Vec<ClassificationScore>, String> {
    let request: ClassifyRequest =
        serde_json::from_value(params).map_err(|error| error.to_string())?;
    inference_embed::classify::classify_request(request)
}

fn handle_tokenize(params: serde_json::Value) -> Result<TokenizeResponse, String> {
    let request: TokenizeRequest =
        serde_json::from_value(params).map_err(|error| error.to_string())?;
    inference_generate::tokenize::tokenize(request)
}

fn handle_generate(params: serde_json::Value) -> Result<GenerateResponse, String> {
    let request: GenerateRequest =
        serde_json::from_value(params).map_err(|error| error.to_string())?;

    // Only cache schema-less requests.  Structured-output requests are NOT
    // cached to avoid returning cached text that no longer matches a changed
    // schema.
    let has_schema = request.schema.is_some();
    if !has_schema {
        if let Some(store) = open_cache_store() {
            let prompt_hash = generate_prompt_hash(&request.prompt);
            let options_hash = generate_options_hash(&request);
            let model = request
                .model
                .clone()
                .unwrap_or_else(|| inference_generate::DEFAULT_GENERATE_MODEL.to_string());
            if let Ok(Some(entry)) = store.get_generate(&model, &prompt_hash, &options_hash) {
                return Ok(GenerateResponse {
                    text: entry.text,
                    model: entry.model,
                    tokens_used: entry.tokens as usize,
                    grammar_fallback: None,
                });
            }

            let response = generate_text(request)?;
            let cache_entry = cache::GenerateCacheEntry {
                model: response.model.clone(),
                prompt_hash,
                options_hash,
                text: response.text.clone(),
                tokens: response.tokens_used as i64,
                // 1-hour TTL
                expires_at: CacheStore::now_epoch_seconds() + 60 * 60,
            };
            let _ = store.put_generate(&cache_entry);
            return Ok(response);
        }
    }

    generate_text(request)
}

fn generate_prompt_hash(prompt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update((prompt.len() as u64).to_be_bytes());
    hasher.update(prompt.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn generate_options_hash(request: &GenerateRequest) -> String {
    let mut hasher = Sha256::new();
    if let Some(model) = &request.model {
        hasher.update(model.as_bytes());
    }
    if let Some(max_tokens) = request.max_tokens {
        hasher.update(max_tokens.to_le_bytes());
    }
    // Encode temperature as bits so minor float differences don't collide
    let temp_bits = request
        .temperature
        .unwrap_or(0.7)
        .to_bits()
        .to_le_bytes();
    hasher.update(temp_bits);
    format!("{:x}", hasher.finalize())
}

fn embed_input_hash(texts: &[String]) -> String {
    let mut hasher = Sha256::new();
    for text in texts {
        hasher.update((text.len() as u64).to_be_bytes());
        hasher.update(text.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

fn open_cache_store() -> Option<CacheStore> {
    let path = cache_path(env::var("FULCRUM_HOME").ok().as_deref())?;
    CacheStore::open(&path).ok()
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
    use std::sync::Mutex;

    // Serialize tests that mutate process-global env vars (SKIP_MODEL_DOWNLOAD,
    // FULCRUM_HOME) to prevent data races in the multi-threaded test runner.
    static ENV_LOCK: Mutex<()> = Mutex::new(());
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
        // models list now reflects models.toml; assert it's an array (length may vary)
        assert!(val["result"]["models"].is_array());
        assert!(val.get("error").is_none() || val["error"].is_null());
    }

    #[test]
    fn dispatch_embed_returns_deterministic_vectors_without_model_download() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let line =
            r#"{"jsonrpc":"2.0","id":7,"method":"embed","params":{"texts":["alpha","beta"]}}"#;

        let resp = dispatch_line(line);

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 7);
        assert_eq!(val["result"]["model"], "BAAI/bge-small-en-v1.5");
        assert_eq!(val["result"]["cached"], false);
        assert_eq!(val["result"]["vectors"].as_array().unwrap().len(), 2);
        assert_eq!(val["result"]["vectors"][0].as_array().unwrap().len(), 384);
        assert_ne!(val["result"]["vectors"][0], val["result"]["vectors"][1]);
    }

    #[test]
    fn dispatch_embed_uses_cache_for_identical_batch() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let home = std::env::temp_dir().join(format!(
            "fulcrum-embed-cache-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::env::set_var("FULCRUM_HOME", &home);
        let line = r#"{"jsonrpc":"2.0","id":8,"method":"embed","params":{"texts":["same text"]}}"#;

        let first = serde_json::to_value(dispatch_line(line)).unwrap();
        let second = serde_json::to_value(dispatch_line(line)).unwrap();

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        std::env::remove_var("FULCRUM_HOME");
        let _ = std::fs::remove_dir_all(home);
        assert_eq!(first["result"]["cached"], false);
        assert_eq!(second["result"]["cached"], true);
        assert_eq!(first["result"]["vectors"], second["result"]["vectors"]);
    }

    #[test]
    fn dispatch_classify_returns_sorted_label_scores() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let line = r#"{"jsonrpc":"2.0","id":9,"method":"classify","params":{"text":"buy groceries","labels":["task","question","reminder"]}}"#;

        let resp = dispatch_line(line);

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 9);
        let results = val["result"].as_array().unwrap();
        assert_eq!(results.len(), 3);
        assert!(results.windows(2).all(|pair| {
            pair[0]["score"].as_f64().unwrap() >= pair[1]["score"].as_f64().unwrap()
        }));
        assert!(results.iter().any(|result| result["label"] == "task"));
    }

    #[test]
    fn dispatch_tokenize_returns_count_and_tokens() {
        let line =
            r#"{"jsonrpc":"2.0","id":10,"method":"tokenize","params":{"text":"hello world"}}"#;

        let resp = dispatch_line(line);

        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 10);
        assert_eq!(val["result"]["count"], val["result"]["tokens"].as_array().unwrap().len());
        assert!(val["result"]["count"].as_u64().unwrap() >= 2);
        assert!(val["result"]["tokens"].as_array().unwrap().iter().any(|token| token == "hello"));
    }

    #[test]
    fn dispatch_generate_returns_non_empty_text_without_model_download() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let line = r#"{"jsonrpc":"2.0","id":11,"method":"generate","params":{"prompt":"The capital of France is","model":null,"max_tokens":null,"temperature":null,"schema":null}}"#;

        let resp = dispatch_line(line);

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 11);
        assert!(val.get("error").is_none() || val["error"].is_null(), "unexpected error: {}", val["error"]);
        let text = val["result"]["text"].as_str().unwrap_or("");
        assert!(!text.is_empty(), "text should not be empty");
        assert!(
            text.to_lowercase().contains("paris"),
            "expected 'Paris' in text, got: {text}"
        );
        assert!(val["result"]["tokens_used"].as_u64().unwrap_or(0) > 0);
    }

    #[test]
    fn dispatch_generate_with_schema_returns_valid_json_matching_schema() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let schema = r#"{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}"#;
        let line = format!(
            r#"{{"jsonrpc":"2.0","id":20,"method":"generate","params":{{"prompt":"route this task","schema":{}}}}}"#,
            schema
        );
        let resp = dispatch_line(&line);
        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 20);
        assert!(
            val.get("error").is_none() || val["error"].is_null(),
            "unexpected error: {}",
            val["error"]
        );
        let text = val["result"]["text"].as_str().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(text).expect("output must be valid JSON");
        assert!(parsed.get("agent").unwrap().is_string(), "agent field must be string");
    }

    #[test]
    fn dispatch_generate_with_invalid_schema_returns_grammar_error() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        // Use a schema with an unsupported type — not a complex-but-fallback-able construct
        let line = r#"{"jsonrpc":"2.0","id":21,"method":"generate","params":{"prompt":"test","schema":{"type":"invalid_type_xyz"}}}"#;
        let resp = dispatch_line(line);
        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        let val: serde_json::Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["error"]["code"], -32602);
        let msg = val["error"]["message"].as_str().unwrap();
        assert!(msg.contains("GRAMMAR_ERROR"), "expected GRAMMAR_ERROR, got: {msg}");
    }

    #[test]
    fn dispatch_generate_with_schema_skips_cache() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let home = std::env::temp_dir().join(format!(
            "fulcrum-schema-cache-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::env::set_var("FULCRUM_HOME", &home);
        let schema = r#"{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}"#;
        let line = format!(
            r#"{{"jsonrpc":"2.0","id":22,"method":"generate","params":{{"prompt":"route","schema":{}}}}}"#,
            schema
        );
        // Two calls — neither should be cached (schema requests bypass cache)
        let first = serde_json::to_value(dispatch_line(&line)).unwrap();
        let second = serde_json::to_value(dispatch_line(&line)).unwrap();
        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        std::env::remove_var("FULCRUM_HOME");
        let _ = std::fs::remove_dir_all(home);
        // Both should succeed (no cache interaction)
        assert!(first.get("error").is_none() || first["error"].is_null());
        assert!(second.get("error").is_none() || second["error"].is_null());
    }

    #[test]
    fn dispatch_generate_uses_cache_for_identical_prompt() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");
        let home = std::env::temp_dir().join(format!(
            "fulcrum-gen-cache-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::env::set_var("FULCRUM_HOME", &home);
        let line = r#"{"jsonrpc":"2.0","id":12,"method":"generate","params":{"prompt":"cached prompt"}}"#;

        // First call — cache miss; second call — same prompt → cache hit
        let first = serde_json::to_value(dispatch_line(line)).unwrap();
        let second = serde_json::to_value(dispatch_line(line)).unwrap();

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        std::env::remove_var("FULCRUM_HOME");
        let _ = std::fs::remove_dir_all(home);

        // Both calls should return the same text
        assert_eq!(first["result"]["text"], second["result"]["text"]);
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
            vectors: vec![vec![0.1, 0.2, 0.3]],
            expires_at: now + 60,
            hit_count: 0,
        };
        store.put_embed(&embed).unwrap();
        assert_eq!(
            store.get_embed("bge-small-en-v1.5", "embed-hash").unwrap(),
            Some(embed)
        );
        let hit = store
            .get_embed("bge-small-en-v1.5", "embed-hash")
            .unwrap()
            .unwrap();
        assert_eq!(hit.hit_count, 1);

        let expired_embed = EmbedCacheEntry {
            model: "bge-small-en-v1.5".to_string(),
            input_hash: "old-embed".to_string(),
            dims: 3,
            vectors: vec![vec![0.0, 0.0, 0.0]],
            expires_at: now - 1,
            hit_count: 0,
        };
        store.put_embed(&expired_embed).unwrap();
        assert_eq!(
            store.get_embed("bge-small-en-v1.5", "old-embed").unwrap(),
            None
        );

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
