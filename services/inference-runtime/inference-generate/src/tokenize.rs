use serde::{Deserialize, Serialize};
use std::path::Path;
use tokenizers::pre_tokenizers::whitespace::Whitespace;
use tokenizers::{OffsetReferential, OffsetType, PreTokenizedString, PreTokenizer, Tokenizer};

#[derive(Debug, Clone, Deserialize)]
pub struct TokenizeRequest {
    pub text: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TokenizeResponse {
    pub count: usize,
    pub tokens: Vec<String>,
}

/// Tokenize text.
///
/// If `model` is a path to a `tokenizer.json` file it uses that tokenizer,
/// otherwise whitespace splitting is used as a model-free baseline.
pub fn tokenize(request: TokenizeRequest) -> Result<TokenizeResponse, String> {
    let tokens = match request.model.as_deref() {
        Some(model) if Path::new(model).is_file() => tokenize_with_file(&request.text, model)?,
        _ => tokenize_with_whitespace(&request.text)?,
    };

    Ok(TokenizeResponse {
        count: tokens.len(),
        tokens,
    })
}

fn tokenize_with_file(text: &str, tokenizer_path: &str) -> Result<Vec<String>, String> {
    let tokenizer = Tokenizer::from_file(tokenizer_path)
        .map_err(|error| format!("failed to load tokenizer: {error}"))?;
    let encoding = tokenizer
        .encode(text, false)
        .map_err(|error| format!("tokenizer encode failed: {error}"))?;
    Ok(encoding.get_tokens().iter().map(|token| token.to_string()).collect())
}

fn tokenize_with_whitespace(text: &str) -> Result<Vec<String>, String> {
    let mut pretokenized = PreTokenizedString::from(text);
    Whitespace::default()
        .pre_tokenize(&mut pretokenized)
        .map_err(|error| format!("tokenizer pre-tokenize failed: {error}"))?;
    Ok(pretokenized
        .get_splits(OffsetReferential::Original, OffsetType::Byte)
        .into_iter()
        .map(|(token, _, _)| token.to_string())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_counts_non_empty_tokens_without_loading_model_weights() {
        let result = tokenize(TokenizeRequest {
            text: "hello world".to_string(),
            model: None,
        })
        .unwrap();

        assert_eq!(result.count, result.tokens.len());
        assert!(result.count >= 2);
        assert!(result.tokens.iter().any(|token| token == "hello"));
        assert!(result.tokens.iter().any(|token| token == "world"));
    }
}
