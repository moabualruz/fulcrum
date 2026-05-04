use fastembed::TextEmbedding;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::{deterministic_vectors, embed, EmbedRequest};

#[derive(Debug, Clone, Deserialize)]
pub struct ClassifyRequest {
    pub text: String,
    pub labels: Vec<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ClassificationScore {
    pub label: String,
    pub score: f32,
}

pub fn classify(
    text: &str,
    labels: &[&str],
    backend: Arc<Mutex<TextEmbedding>>,
) -> Result<Vec<ClassificationScore>, String> {
    if text.trim().is_empty() {
        return Err("classify requires text".to_string());
    }
    if labels.is_empty() {
        return Err("classify requires at least one label".to_string());
    }

    let mut docs = Vec::with_capacity(labels.len() + 1);
    docs.push(text);
    docs.extend(labels.iter().copied());

    let guard = backend
        .lock()
        .map_err(|_| "embedding model lock poisoned".to_string())?;
    let vectors = guard.embed(docs, None).map_err(|error| error.to_string())?;
    score_vectors(labels, vectors)
}

pub fn classify_request(request: ClassifyRequest) -> Result<Vec<ClassificationScore>, String> {
    if request.text.trim().is_empty() {
        return Err("classify requires text".to_string());
    }
    if request.labels.is_empty() {
        return Err("classify requires at least one label".to_string());
    }
    if request.labels.iter().any(|label| label.trim().is_empty()) {
        return Err("classify labels must be non-empty".to_string());
    }

    let mut texts = Vec::with_capacity(request.labels.len() + 1);
    texts.push(request.text.clone());
    texts.extend(request.labels.iter().cloned());

    let vectors = if std::env::var("SKIP_MODEL_DOWNLOAD").ok().as_deref() == Some("1") {
        deterministic_vectors(&texts)
    } else {
        embed(EmbedRequest {
            texts,
            model: request.model,
        })?
        .vectors
    };
    let label_refs = request.labels.iter().map(String::as_str).collect::<Vec<_>>();
    score_vectors(&label_refs, vectors)
}

pub fn classify_from_vectors(
    text_vector: &[f32],
    labels: Vec<(String, Vec<f32>)>,
) -> Vec<ClassificationScore> {
    let mut results = labels
        .into_iter()
        .map(|(label, vector)| ClassificationScore {
            label,
            score: cosine_similarity(text_vector, &vector),
        })
        .collect::<Vec<_>>();
    sort_scores(&mut results);
    results
}

fn score_vectors(labels: &[&str], vectors: Vec<Vec<f32>>) -> Result<Vec<ClassificationScore>, String> {
    let mut vectors = vectors.into_iter();
    let Some(text_vector) = vectors.next() else {
        return Err("embedding backend returned no text vector".to_string());
    };
    let label_vectors = vectors.collect::<Vec<_>>();
    if label_vectors.len() != labels.len() {
        return Err("embedding backend returned wrong label vector count".to_string());
    }

    Ok(classify_from_vectors(
        &text_vector,
        labels
            .iter()
            .zip(label_vectors)
            .map(|(label, vector)| ((*label).to_string(), vector))
            .collect(),
    ))
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    let len = left.len().min(right.len());
    if len == 0 {
        return 0.0;
    }

    let mut dot = 0.0_f32;
    let mut left_norm = 0.0_f32;
    let mut right_norm = 0.0_f32;
    for index in 0..len {
        dot += left[index] * right[index];
        left_norm += left[index] * left[index];
        right_norm += right[index] * right[index];
    }

    if left_norm == 0.0 || right_norm == 0.0 {
        return 0.0;
    }
    dot / (left_norm.sqrt() * right_norm.sqrt())
}

fn sort_scores(results: &mut [ClassificationScore]) {
    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.label.cmp(&right.label))
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_from_vectors_scores_all_labels_sorted_descending() {
        let text_vector = vec![1.0, 0.0];
        let labels = vec![
            ("question".to_string(), vec![0.0, 1.0]),
            ("task".to_string(), vec![0.9, 0.1]),
            ("reminder".to_string(), vec![0.2, 0.8]),
        ];

        let results = classify_from_vectors(&text_vector, labels);

        assert_eq!(
            results.iter().map(|result| result.label.as_str()).collect::<Vec<_>>(),
            vec!["task", "reminder", "question"],
        );
        assert!(results[0].score > results[1].score);
        assert!(results[1].score > results[2].score);
    }

    #[test]
    fn classify_request_scores_each_label_with_skip_model_download() {
        std::env::set_var("SKIP_MODEL_DOWNLOAD", "1");

        let results = classify_request(ClassifyRequest {
            text: "buy groceries".to_string(),
            labels: vec![
                "task".to_string(),
                "question".to_string(),
                "reminder".to_string(),
            ],
            model: None,
        })
        .unwrap();

        std::env::remove_var("SKIP_MODEL_DOWNLOAD");
        assert_eq!(results.len(), 3);
        assert_eq!(
            results.iter().map(|result| result.label.as_str()).collect::<Vec<_>>().len(),
            3,
        );
        assert!(results.windows(2).all(|pair| pair[0].score >= pair[1].score));
    }
}
