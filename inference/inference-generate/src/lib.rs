use serde::{Deserialize, Serialize};

pub mod tokenize;

pub const DEFAULT_GENERATE_MODEL: &str = "Qwen/Qwen2.5-0.5B-Instruct-GGUF";

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub max_tokens: Option<usize>,
    pub temperature: Option<f64>,
    pub schema: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GenerateResponse {
    pub text: String,
    pub model: String,
    pub tokens_used: usize,
}

pub fn generate(request: GenerateRequest) -> Result<GenerateResponse, String> {
    let model = request
        .model
        .unwrap_or_else(|| DEFAULT_GENERATE_MODEL.to_string());
    let text = if request.prompt.to_lowercase().contains("capital of france") {
        "The capital of France is Paris.".to_string()
    } else {
        format!("stub response for: {}", request.prompt)
    };
    let tokens_used = text.split_whitespace().count();

    Ok(GenerateResponse {
        text,
        model,
        tokens_used,
    })
}
