use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

type ModelResult<T> = Result<T, ModelError>;

#[derive(Debug)]
pub struct ModelError(String);

impl ModelError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for ModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ModelError {}

impl From<std::io::Error> for ModelError {
    fn from(error: std::io::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<reqwest::Error> for ModelError {
    fn from(error: reqwest::Error) -> Self {
        Self(error.to_string())
    }
}

impl From<toml::de::Error> for ModelError {
    fn from(error: toml::de::Error) -> Self {
        Self(error.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ModelKind {
    #[serde(rename = "embed")]
    Embed,
    #[serde(rename = "generate")]
    Generate,
    #[serde(rename = "classify")]
    Classify,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ModelSource {
    #[serde(rename = "bundled")]
    Bundled,
    #[serde(rename = "huggingface")]
    HuggingFace,
    #[serde(rename = "local")]
    Local,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDefinition {
    pub id: String,
    pub kind: ModelKind,
    pub source: ModelSource,
    pub url: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelManifest {
    pub models: Vec<ModelDefinition>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceModelInfo {
    pub id: String,
    pub kind: ModelKind,
    pub downloaded: bool,
    pub active: bool,
    pub size_bytes: u64,
    pub size_bytes_actual: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelPullParams {
    #[serde(rename = "modelId")]
    pub model_id: String,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelDownloadProgress {
    #[serde(rename = "type")]
    pub event_type: String,
    pub pct: u8,
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Debug, Clone)]
pub struct ModelManager {
    home: PathBuf,
    manifest: ModelManifest,
}

impl ModelManager {
    pub fn new(home: PathBuf, manifest: ModelManifest) -> Self {
        Self { home, manifest }
    }

    pub fn load(home: PathBuf) -> ModelResult<Self> {
        Ok(Self::new(home, load_manifest()?))
    }

    pub fn list(&self) -> Vec<InferenceModelInfo> {
        self.manifest
            .models
            .iter()
            .map(|definition| {
                let path = self.model_path(&definition.id);
                let size_bytes_actual = fs::metadata(&path).ok().map(|meta| meta.len());
                InferenceModelInfo {
                    id: definition.id.clone(),
                    kind: definition.kind.clone(),
                    downloaded: size_bytes_actual.is_some(),
                    active: definition.kind == ModelKind::Embed,
                    size_bytes: definition.size_bytes,
                    size_bytes_actual,
                }
            })
            .collect()
    }

    pub fn ensure(&self, model_id: &str, force: bool) -> ModelResult<Vec<ModelDownloadProgress>> {
        let definition = self.definition(model_id)?;
        let target = self.model_path(model_id);
        if target.exists() && !force {
            let size = fs::metadata(&target)
                .map(|meta| meta.len())
                .unwrap_or(definition.size_bytes);
            return Ok(vec![progress(100, size, size)]);
        }

        fs::create_dir_all(self.models_dir())?;
        if let Some(local_path) = self.local_override_path(model_id) {
            return self.copy_local_model(definition, &local_path, &target);
        }

        self.download_model(definition, &target)
    }

    pub fn remove(&self, model_id: &str) -> ModelResult<bool> {
        let path = self.model_path(model_id);
        if path.exists() {
            fs::remove_file(path)?;
            return Ok(true);
        }
        Ok(false)
    }

    fn definition(&self, model_id: &str) -> ModelResult<&ModelDefinition> {
        self.manifest
            .models
            .iter()
            .find(|model| model.id == model_id)
            .ok_or_else(|| ModelError::new(format!("unknown model id: {model_id}")))
    }

    fn models_dir(&self) -> PathBuf {
        self.home.join("models")
    }

    fn model_path(&self, model_id: &str) -> PathBuf {
        self.models_dir()
            .join(format!("{}.gguf", safe_model_file_stem(model_id)))
    }

    fn local_override_path(&self, model_id: &str) -> Option<PathBuf> {
        let dir = std::env::var("FULCRUM_MODELS_DIR")
            .ok()
            .filter(|value| !value.is_empty())?;
        let root = PathBuf::from(dir);
        let safe = root.join(format!("{}.gguf", safe_model_file_stem(model_id)));
        if safe.exists() {
            return Some(safe);
        }
        let nested = root.join(format!("{model_id}.gguf"));
        if nested.exists() {
            return Some(nested);
        }
        None
    }

    fn copy_local_model(
        &self,
        definition: &ModelDefinition,
        local_path: &Path,
        target: &Path,
    ) -> ModelResult<Vec<ModelDownloadProgress>> {
        let mut events = vec![progress(0, 0, definition.size_bytes)];
        let temp = target.with_extension("gguf.download");
        fs::copy(local_path, &temp)?;
        let actual = fs::metadata(&temp)
            .map(|meta| meta.len())
            .unwrap_or(definition.size_bytes);
        verify_sha256(&temp, &definition.sha256).inspect_err(|_| {
            let _ = fs::remove_file(&temp);
        })?;
        fs::rename(&temp, target)?;
        events.push(progress(100, actual, actual));
        Ok(events)
    }

    fn download_model(
        &self,
        definition: &ModelDefinition,
        target: &Path,
    ) -> ModelResult<Vec<ModelDownloadProgress>> {
        let temp = target.with_extension("gguf.download");
        let _ = fs::remove_file(&temp);

        let mut response = reqwest::blocking::get(&definition.url)?.error_for_status()?;
        let total = response.content_length().unwrap_or(definition.size_bytes);
        let mut file = File::create(&temp)?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0_u64;
        let mut events = vec![progress(0, 0, total)];
        let mut buffer = [0_u8; 64 * 1024];

        loop {
            let read = response.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read])?;
            hasher.update(&buffer[..read]);
            downloaded += read as u64;
            let pct = if total == 0 {
                99
            } else {
                ((downloaded.saturating_mul(100) / total).min(99)) as u8
            };
            if events.last().map(|event| event.pct) != Some(pct) {
                events.push(progress(pct, downloaded, total));
            }
        }
        file.flush()?;
        drop(file);

        let actual_sha = format!("{:x}", hasher.finalize());
        if actual_sha != definition.sha256 {
            let _ = fs::remove_file(&temp);
            let _ = fs::remove_file(target);
            return Err(ModelError::new(format!(
                "sha256 mismatch for {}: expected {}, got {}",
                definition.id, definition.sha256, actual_sha
            )));
        }

        fs::rename(&temp, target)?;
        events.push(progress(100, downloaded, total));
        Ok(events)
    }
}

pub fn manager_from_env() -> ModelResult<ModelManager> {
    let home = std::env::var("FULCRUM_HOME")
        .map(PathBuf::from)
        .map_err(|_| ModelError::new("FULCRUM_HOME is required for model registry"))?;
    ModelManager::load(home)
}

fn load_manifest() -> ModelResult<ModelManifest> {
    let manifest_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| ModelError::new("inference manifest parent not found"))?
        .join("models.toml");
    let raw = fs::read_to_string(manifest_path)?;
    Ok(toml::from_str(&raw)?)
}

fn safe_model_file_stem(model_id: &str) -> String {
    model_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

fn verify_sha256(path: &Path, expected: &str) -> ModelResult<()> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected {
        return Err(ModelError::new(format!(
            "sha256 mismatch: expected {expected}, got {actual}"
        )));
    }
    Ok(())
}

fn progress(pct: u8, downloaded: u64, total: u64) -> ModelDownloadProgress {
    ModelDownloadProgress {
        event_type: "download_progress".to_string(),
        pct,
        downloaded,
        total,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_home(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("fulcrum-models-{name}-{unique}"))
    }

    fn serve_once(body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            let headers = format!(
                "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(headers.as_bytes()).unwrap();
            stream.write_all(&body).unwrap();
        });
        url
    }

    #[test]
    fn ensure_downloads_model_and_emits_ordered_progress() {
        let home = temp_home("ok");
        let bytes = b"fixture gguf bytes".to_vec();
        let sha256 = format!("{:x}", sha2::Sha256::digest(&bytes));
        let url = serve_once(bytes.clone());
        let manifest = ModelManifest {
            models: vec![ModelDefinition {
                id: "fixture/model".to_string(),
                kind: ModelKind::Embed,
                source: ModelSource::HuggingFace,
                url,
                sha256,
                size_bytes: bytes.len() as u64,
            }],
        };
        let manager = ModelManager::new(home.clone(), manifest);

        let events = manager.ensure("fixture/model", true).unwrap();

        assert_eq!(events.first().unwrap().pct, 0);
        assert_eq!(events.last().unwrap().pct, 100);
        assert!(events.windows(2).all(|pair| pair[0].pct <= pair[1].pct));
        assert_eq!(
            std::fs::read(home.join("models").join("fixture_model.gguf")).unwrap(),
            bytes
        );
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn ensure_deletes_partial_file_on_sha256_mismatch() {
        let home = temp_home("bad-sha");
        let url = serve_once(b"wrong bytes".to_vec());
        let manifest = ModelManifest {
            models: vec![ModelDefinition {
                id: "fixture/model".to_string(),
                kind: ModelKind::Embed,
                source: ModelSource::HuggingFace,
                url,
                sha256: "0".repeat(64),
                size_bytes: 11,
            }],
        };
        let manager = ModelManager::new(home.clone(), manifest);

        let error = manager.ensure("fixture/model", true).unwrap_err();

        assert!(error.to_string().contains("sha256 mismatch"));
        assert!(!home.join("models").join("fixture_model.gguf").exists());
        let _ = std::fs::remove_dir_all(home);
    }
}
