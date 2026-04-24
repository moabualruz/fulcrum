pub mod lancedb;
pub mod tree_sitter;
pub mod zoekt;

use fulcrum_events::{EventKind, EventStore, LocalEvent};
use fulcrum_graph::{GraphRef, OsGraph};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeFile {
    pub path: String,
    pub body: String,
    pub symbols: Vec<String>,
    pub imports: Vec<String>,
    pub chunks: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchSource {
    Lexical,
    Semantic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub path: String,
    pub source: SearchSource,
    pub score: usize,
    pub excerpt: String,
}

#[derive(Debug, Default)]
pub struct CodeIndex {
    files: BTreeMap<String, CodeFile>,
    events: EventStore,
    graph: OsGraph,
}

impl CodeIndex {
    pub fn new() -> Self {
        Self {
            files: BTreeMap::new(),
            events: EventStore::new(),
            graph: OsGraph::new(),
        }
    }

    pub fn upsert_file(&mut self, path: impl Into<String>, body: impl Into<String>) -> CodeFile {
        let path = path.into();
        let body = body.into();
        self.remove_graph_refs(&path);
        let file = CodeFile {
            symbols: extract_symbols(&body),
            imports: extract_imports(&body),
            chunks: extract_chunks(&body),
            path: path.clone(),
            body,
        };
        self.link_file_refs(&file);
        self.events.append_with_attributes(
            EventKind::IndexUpdated,
            path.clone(),
            "code file indexed",
            [
                ("symbols", file.symbols.len().to_string()),
                ("chunks", file.chunks.len().to_string()),
            ],
        );
        self.files.insert(path, file.clone());
        file
    }

    pub fn delete_file(&mut self, path: &str) -> Result<(), String> {
        self.files
            .remove(path)
            .ok_or_else(|| format!("code file not found: {path}"))?;
        self.remove_graph_refs(path);
        self.events.append_with_attributes(
            EventKind::IndexUpdated,
            path,
            "code file deleted from index",
            [("deleted", "true")],
        );
        Ok(())
    }

    pub fn search(&self, query: &str) -> Vec<SearchHit> {
        let mut hits = Vec::new();
        for file in self.files.values() {
            if file.body.contains(query) || file.symbols.iter().any(|symbol| symbol == query) {
                hits.push(SearchHit {
                    path: file.path.clone(),
                    source: SearchSource::Lexical,
                    score: 10
                        + file
                            .symbols
                            .iter()
                            .filter(|symbol| *symbol == query)
                            .count(),
                    excerpt: first_matching_line(&file.body, query),
                });
                continue;
            }
            let semantic_score = semantic_score(query, &file.body);
            if semantic_score > 0 {
                hits.push(SearchHit {
                    path: file.path.clone(),
                    source: SearchSource::Semantic,
                    score: semantic_score,
                    excerpt: file.chunks.first().cloned().unwrap_or_default(),
                });
            }
        }
        hits.sort_by(|left, right| right.score.cmp(&left.score));
        hits
    }

    pub fn files(&self) -> Vec<&CodeFile> {
        self.files.values().collect()
    }

    pub fn events(&self) -> &[LocalEvent] {
        self.events.replay()
    }

    pub fn graph(&self) -> &OsGraph {
        &self.graph
    }

    fn link_file_refs(&mut self, file: &CodeFile) {
        let file_ref = GraphRef::new("file", &file.path);
        for symbol in &file.symbols {
            self.graph.link(
                file_ref.clone(),
                "declares",
                GraphRef::new("symbol", symbol),
            );
        }
        for import in &file.imports {
            self.graph
                .link(file_ref.clone(), "imports", GraphRef::new("import", import));
        }
        for chunk in &file.chunks {
            self.graph.link(
                file_ref.clone(),
                "chunks",
                GraphRef::new("chunk", format!("{}#{}", file.path, stable_chunk_id(chunk))),
            );
        }
    }

    fn remove_graph_refs(&mut self, path: &str) {
        self.graph
            .remove_edges_touching(&GraphRef::new("file", path));
    }
}

fn extract_symbols(body: &str) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            for prefix in [
                "pub async fn ",
                "async fn ",
                "pub(crate) fn ",
                "pub fn ",
                "fn ",
                "pub struct ",
                "struct ",
                "pub enum ",
                "enum ",
                "pub trait ",
                "trait ",
                "class ",
                "function ",
                "export function ",
            ] {
                if let Some(rest) = trimmed.strip_prefix(prefix) {
                    return Some(
                        rest.split(|character: char| {
                            !(character.is_ascii_alphanumeric() || character == '_')
                        })
                        .next()
                        .unwrap_or_default()
                        .to_string(),
                    );
                }
            }
            if let Some(rest) = trimmed.strip_prefix("impl ") {
                return Some(format!(
                    "impl:{}",
                    rest.split(|character: char| {
                        !(character.is_ascii_alphanumeric() || character == '_')
                    })
                    .next()
                    .unwrap_or_default()
                ));
            }
            None
        })
        .filter(|symbol| !symbol.is_empty())
        .collect()
}

fn extract_imports(body: &str) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix("use ")
                .or_else(|| trimmed.strip_prefix("import "))
                .map(|import| import.trim_end_matches(';').to_string())
        })
        .collect()
}

fn extract_chunks(body: &str) -> Vec<String> {
    body.split("\n\n")
        .map(str::trim)
        .filter(|chunk| !chunk.is_empty())
        .map(str::to_string)
        .collect()
}

fn first_matching_line(body: &str, query: &str) -> String {
    body.lines()
        .find(|line| line.contains(query))
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn semantic_score(query: &str, body: &str) -> usize {
    let query_terms = terms(query);
    let body_terms = terms(body);
    let matches = query_terms
        .iter()
        .filter(|term| body_terms.contains(term))
        .count();
    if matches == query_terms.len() {
        matches
    } else {
        0
    }
}

fn terms(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(|term| term.to_ascii_lowercase())
        .collect()
}

fn stable_chunk_id(value: &str) -> u64 {
    value.bytes().fold(0_u64, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(byte as u64)
    })
}
