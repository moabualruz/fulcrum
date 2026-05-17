use fastembed::TextEmbedding;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub mod classify;

pub const DEFAULT_EMBED_MODEL: &str = "BAAI/bge-small-en-v1.5";
pub const DEFAULT_EMBED_DIMS: usize = 384;

static DEFAULT_MODEL: OnceCell<Arc<Mutex<TextEmbedding>>> = OnceCell::new();

#[derive(Debug, Clone, Deserialize)]
pub struct EmbedRequest {
    pub texts: Vec<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct EmbedResponse {
    pub vectors: Vec<Vec<f32>>,
    pub model: String,
    pub cached: bool,
}

pub fn embed(request: EmbedRequest) -> Result<EmbedResponse, String> {
    if request.texts.is_empty() {
        return Err("embed requires at least one text".to_string());
    }
    let model = request.model.unwrap_or_else(|| DEFAULT_EMBED_MODEL.to_string());
    let vectors = if std::env::var("SKIP_MODEL_DOWNLOAD").ok().as_deref() == Some("1") {
        deterministic_vectors(&request.texts)
    } else {
        embed_with_fastembed(&request.texts, &model)?
    };

    Ok(EmbedResponse {
        vectors,
        model,
        cached: false,
    })
}

pub fn deterministic_vectors(texts: &[String]) -> Vec<Vec<f32>> {
    texts.iter().map(|text| deterministic_vector(text)).collect()
}

fn deterministic_vector(text: &str) -> Vec<f32> {
    let mut state = 0xcbf29ce484222325_u64;
    for byte in text.as_bytes() {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(0x100000001b3);
    }

    (0..DEFAULT_EMBED_DIMS)
        .map(|idx| {
            state ^= idx as u64;
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            let unit = ((state >> 32) as u32) as f32 / u32::MAX as f32;
            unit * 2.0 - 1.0
        })
        .collect()
}

fn embed_with_fastembed(texts: &[String], model: &str) -> Result<Vec<Vec<f32>>, String> {
    if model != DEFAULT_EMBED_MODEL {
        return Err(format!("unsupported embedded model: {model}"));
    }

    let model = DEFAULT_MODEL
        .get_or_try_init(|| {
            TextEmbedding::try_new(Default::default())
                .map(|model| Arc::new(Mutex::new(model)))
                .map_err(|error| error.to_string())
        })?
        .clone();
    let docs = texts.iter().map(String::as_str).collect::<Vec<_>>();
    let guard = model.lock().map_err(|_| "embedding model lock poisoned".to_string())?;
    guard.embed(docs, None).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_embed_returns_one_384_dim_vector_per_text() {
        let vectors = deterministic_vectors(&["alpha".to_string(), "beta".to_string()]);

        assert_eq!(vectors.len(), 2);
        assert_eq!(vectors[0].len(), DEFAULT_EMBED_DIMS);
        assert_eq!(vectors[1].len(), DEFAULT_EMBED_DIMS);
        assert_ne!(vectors[0], vectors[1]);
    }

    #[test]
    fn skip_model_download_uses_deterministic_path() {
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");

        let response = embed(EmbedRequest {
            texts: vec!["hello".to_string()],
            model: None,
        })
        .unwrap();

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        assert_eq!(response.model, DEFAULT_EMBED_MODEL);
        assert_eq!(response.vectors.len(), 1);
        assert_eq!(response.vectors[0].len(), DEFAULT_EMBED_DIMS);
    }
}
