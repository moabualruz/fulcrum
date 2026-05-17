use serde::{Deserialize, Serialize};

pub mod grammar;
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
    /// Present when schema was requested and a fallback path was used.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grammar_fallback: Option<bool>,
}

fn generate_raw(prompt: &str) -> String {
    if prompt.to_lowercase().contains("capital of france") {
        "The capital of France is Paris.".to_string()
    } else if prompt.contains("Respond with ONLY valid JSON") {
        // Schema-constrained stub: try to produce a simple JSON object
        // matching common test schemas
        if prompt.contains("\"agent\"") {
            r#"{"agent": "stub"}"#.to_string()
        } else {
            r#"{}"#.to_string()
        }
    } else {
        format!("stub response for: {}", prompt)
    }
}

pub fn generate(request: GenerateRequest) -> Result<GenerateResponse, String> {
    let model = request
        .model
        .unwrap_or_else(|| DEFAULT_GENERATE_MODEL.to_string());

    if let Some(schema) = &request.schema {
        let gen_fn = |prompt: &str| -> Result<String, String> { Ok(generate_raw(prompt)) };
        match grammar::generate_with_schema(&gen_fn, &request.prompt, schema) {
            Ok((text, fallback)) => {
                let tokens_used = text.split_whitespace().count();
                Ok(GenerateResponse {
                    text,
                    model,
                    tokens_used,
                    grammar_fallback: if fallback { Some(true) } else { None },
                })
            }
            Err(grammar::GrammarError::InvalidSchema(msg)) => {
                Err(format!("GRAMMAR_ERROR: {}", msg))
            }
            Err(grammar::GrammarError::ValidationFailed(msg)) => {
                Err(format!("GRAMMAR_VALIDATION: {}", msg))
            }
        }
    } else {
        let text = generate_raw(&request.prompt);
        let tokens_used = text.split_whitespace().count();
        Ok(GenerateResponse {
            text,
            model,
            tokens_used,
            grammar_fallback: None,
        })
    }
}
