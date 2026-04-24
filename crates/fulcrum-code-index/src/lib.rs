pub mod lancedb;
pub mod tree_sitter;
pub mod zoekt;

use fulcrum_events::{EventKind, EventStore, LocalEvent};
use fulcrum_graph::{GraphRef, OsGraph};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeFile {
    pub path: String,
    pub body: String,
    pub symbols: Vec<String>,
    pub imports: Vec<String>,
    pub chunks: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileState {
    pub path: String,
    pub mtime_unix_secs: u64,
    pub size_bytes: u64,
    pub content_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexOperation {
    Create {
        state: FileState,
    },
    Update {
        previous: FileState,
        current: FileState,
    },
    Delete {
        previous: FileState,
    },
    Rename {
        from: String,
        to: String,
        previous: FileState,
        current: FileState,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistentIndexSnapshot {
    pub format_version: u32,
    pub files: BTreeMap<String, FileState>,
    pub operations: Vec<IndexOperation>,
}

impl Default for PersistentIndexSnapshot {
    fn default() -> Self {
        Self {
            format_version: 1,
            files: BTreeMap::new(),
            operations: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchSource {
    Lexical,
    Semantic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchKind {
    Exact,
    Path,
    Import,
    Symbol,
    Regex,
    Semantic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub path: String,
    pub source: SearchSource,
    pub kind: SearchKind,
    pub score: usize,
    pub excerpt: String,
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextPack {
    pub query: String,
    pub results: Vec<ContextPackResult>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextPackResult {
    pub path: String,
    pub source: SearchSource,
    pub kind: SearchKind,
    pub score: usize,
    pub excerpt: String,
    pub explanation: String,
    pub graph_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StaleReason {
    Missing,
    Modified,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleFile {
    pub path: String,
    pub reason: StaleReason,
    pub indexed: FileState,
    pub current: Option<FileState>,
}

#[derive(Debug, Default)]
pub struct CodeIndex {
    files: BTreeMap<String, CodeFile>,
    snapshot: PersistentIndexSnapshot,
    events: EventStore,
    graph: OsGraph,
}

impl CodeIndex {
    pub fn new() -> Self {
        Self {
            files: BTreeMap::new(),
            snapshot: PersistentIndexSnapshot::default(),
            events: EventStore::new(),
            graph: OsGraph::new(),
        }
    }

    pub fn upsert_file(&mut self, path: impl Into<String>, body: impl Into<String>) -> CodeFile {
        let path = path.into();
        let body = body.into();
        let state = FileState::from_body(path.clone(), &body);
        self.upsert_file_with_state(path, body, state)
    }

    pub fn create_file(
        &mut self,
        path: impl Into<String>,
        body: impl Into<String>,
    ) -> Result<CodeFile, String> {
        let path = path.into();
        if self.files.contains_key(&path) {
            return Err(format!("code file already exists: {path}"));
        }
        Ok(self.upsert_file(path, body))
    }

    pub fn update_file(
        &mut self,
        path: impl Into<String>,
        body: impl Into<String>,
    ) -> Result<CodeFile, String> {
        let path = path.into();
        if !self.files.contains_key(&path) {
            return Err(format!("code file not found: {path}"));
        }
        Ok(self.upsert_file(path, body))
    }

    pub fn upsert_file_with_state(
        &mut self,
        path: impl Into<String>,
        body: impl Into<String>,
        mut state: FileState,
    ) -> CodeFile {
        let path = path.into();
        let body = body.into();
        state.path = path.clone();
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
        self.record_upsert_state(state);
        self.files.insert(path, file.clone());
        file
    }

    pub fn index_repo(&mut self, root: impl AsRef<Path>) -> io::Result<Vec<CodeFile>> {
        let root = root.as_ref();
        let ignore_patterns = load_ignore_patterns(root)?;
        let mut paths = collect_files(root, root, &ignore_patterns)?;
        paths.sort();
        let mut readable_files = Vec::new();
        let mut current_paths = BTreeSet::new();
        for path in paths {
            let rel_path = relative_path(root, &path);
            let bytes = fs::read(&path)?;
            if is_probably_binary(&bytes) {
                continue;
            }
            current_paths.insert(rel_path.clone());
            readable_files.push((rel_path, path, bytes));
        }
        let deleted = self
            .snapshot
            .files
            .keys()
            .filter(|path| !current_paths.contains(*path))
            .cloned()
            .collect::<Vec<_>>();
        for path in deleted {
            self.delete_file(&path).map_err(io::Error::other)?;
        }

        let mut indexed = Vec::new();
        for (rel_path, path, bytes) in readable_files {
            let body = String::from_utf8_lossy(&bytes).to_string();
            let state = FileState::from_path_and_bytes(rel_path.clone(), &path, &bytes)?;
            indexed.push(self.upsert_file_with_state(rel_path, body, state));
        }

        Ok(indexed)
    }

    pub fn delete_file(&mut self, path: &str) -> Result<(), String> {
        self.files
            .remove(path)
            .ok_or_else(|| format!("code file not found: {path}"))?;
        self.remove_graph_refs(path);
        let previous = self
            .snapshot
            .files
            .remove(path)
            .ok_or_else(|| format!("file state not found: {path}"))?;
        self.snapshot
            .operations
            .push(IndexOperation::Delete { previous });
        self.events.append_with_attributes(
            EventKind::IndexUpdated,
            path,
            "code file deleted from index",
            [("deleted", "true")],
        );
        Ok(())
    }

    pub fn rename_file(&mut self, from: &str, to: impl Into<String>) -> Result<CodeFile, String> {
        let to = to.into();
        let mut file = self
            .files
            .remove(from)
            .ok_or_else(|| format!("code file not found: {from}"))?;
        let previous = self
            .snapshot
            .files
            .remove(from)
            .ok_or_else(|| format!("file state not found: {from}"))?;

        self.remove_graph_refs(from);
        file.path = to.clone();
        let mut current = previous.clone();
        current.path = to.clone();
        self.link_file_refs(&file);
        self.snapshot.files.insert(to.clone(), current.clone());
        self.snapshot.operations.push(IndexOperation::Rename {
            from: from.to_string(),
            to: to.clone(),
            previous,
            current,
        });
        self.events.append_with_attributes(
            EventKind::IndexUpdated,
            to.clone(),
            "code file renamed in index",
            [("from", from.to_string())],
        );
        self.files.insert(to, file.clone());
        Ok(file)
    }

    pub fn search(&self, query: &str) -> Vec<SearchHit> {
        let mut hits = BTreeMap::<String, SearchHit>::new();
        for hit in self.symbol_search(query) {
            insert_best_hit(&mut hits, hit);
        }
        for hit in self.exact_search(query) {
            insert_best_hit(&mut hits, hit);
        }
        for hit in self.path_search(query) {
            insert_best_hit(&mut hits, hit);
        }
        for hit in self.import_search(query) {
            insert_best_hit(&mut hits, hit);
        }
        for file in self.files.values() {
            if hits.contains_key(&file.path) {
                continue;
            }
            let semantic_score = semantic_score(query, &file.body);
            if semantic_score > 0 {
                insert_best_hit(
                    &mut hits,
                    SearchHit {
                        path: file.path.clone(),
                        source: SearchSource::Semantic,
                        kind: SearchKind::Semantic,
                        score: semantic_score,
                        excerpt: file.chunks.first().cloned().unwrap_or_default(),
                        explanation: format!("semantic terms matched: {}", terms(query).join(", ")),
                    },
                );
            }
        }
        let mut hits = hits.into_values().collect::<Vec<_>>();
        hits.sort_by(|left, right| right.score.cmp(&left.score));
        hits
    }

    pub fn exact_search(&self, query: &str) -> Vec<SearchHit> {
        let mut hits = Vec::new();
        for file in self.files.values() {
            let symbol_matches = file
                .symbols
                .iter()
                .filter(|symbol| symbol.as_str() == query)
                .count();
            if file.body.contains(query) || symbol_matches > 0 {
                hits.push(SearchHit {
                    path: file.path.clone(),
                    source: SearchSource::Lexical,
                    kind: SearchKind::Exact,
                    score: 100 + symbol_matches * 25,
                    excerpt: first_matching_line(&file.body, query),
                    explanation: format!("exact text match for `{query}`"),
                });
            }
        }
        sort_hits(hits)
    }

    pub fn path_search(&self, query: &str) -> Vec<SearchHit> {
        sort_hits(
            self.files
                .values()
                .filter(|file| file.path.contains(query))
                .map(|file| SearchHit {
                    path: file.path.clone(),
                    source: SearchSource::Lexical,
                    kind: SearchKind::Path,
                    score: 80 + query.len(),
                    excerpt: file.path.clone(),
                    explanation: format!("path contains `{query}`"),
                })
                .collect(),
        )
    }

    pub fn import_search(&self, query: &str) -> Vec<SearchHit> {
        sort_hits(
            self.files
                .values()
                .filter_map(|file| {
                    let matched = file.imports.iter().find(|import| import.contains(query))?;
                    Some(SearchHit {
                        path: file.path.clone(),
                        source: SearchSource::Lexical,
                        kind: SearchKind::Import,
                        score: 90 + matched.len(),
                        excerpt: matched.clone(),
                        explanation: format!("import contains `{query}`"),
                    })
                })
                .collect(),
        )
    }

    pub fn symbol_search(&self, query: &str) -> Vec<SearchHit> {
        sort_hits(
            self.files
                .values()
                .filter_map(|file| {
                    let matched = file.symbols.iter().find(|symbol| symbol.contains(query))?;
                    Some(SearchHit {
                        path: file.path.clone(),
                        source: SearchSource::Lexical,
                        kind: SearchKind::Symbol,
                        score: if matched == query { 130 } else { 105 },
                        excerpt: matched.clone(),
                        explanation: format!("symbol match `{matched}`"),
                    })
                })
                .collect(),
        )
    }

    pub fn context_pack(&self, query: &str, limit: usize) -> ContextPack {
        let results = self
            .search(query)
            .into_iter()
            .take(limit)
            .map(|hit| ContextPackResult {
                graph_refs: self.graph_refs_for_path(&hit.path),
                path: hit.path,
                source: hit.source,
                kind: hit.kind,
                score: hit.score,
                excerpt: hit.excerpt,
                explanation: hit.explanation,
            })
            .collect();
        ContextPack {
            query: query.to_string(),
            results,
        }
    }

    pub fn stale_files(&self, root: impl AsRef<Path>) -> io::Result<Vec<StaleFile>> {
        let root = root.as_ref();
        let mut stale = Vec::new();
        for indexed in self.snapshot.files.values() {
            let path = root.join(&indexed.path);
            if !path.exists() {
                stale.push(StaleFile {
                    path: indexed.path.clone(),
                    reason: StaleReason::Missing,
                    indexed: indexed.clone(),
                    current: None,
                });
                continue;
            }

            let bytes = fs::read(&path)?;
            let current = FileState::from_path_and_bytes(indexed.path.clone(), &path, &bytes)?;
            if &current != indexed {
                stale.push(StaleFile {
                    path: indexed.path.clone(),
                    reason: StaleReason::Modified,
                    indexed: indexed.clone(),
                    current: Some(current),
                });
            }
        }
        Ok(stale)
    }

    pub fn files(&self) -> Vec<&CodeFile> {
        self.files.values().collect()
    }

    pub fn snapshot(&self) -> &PersistentIndexSnapshot {
        &self.snapshot
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

    fn graph_refs_for_path(&self, path: &str) -> Vec<String> {
        let file_ref = GraphRef::new("file", path);
        self.graph
            .edges_from(&file_ref)
            .into_iter()
            .map(|edge| format!("{}:{}:{}", edge.relation, edge.to.kind, edge.to.id))
            .collect()
    }

    fn remove_graph_refs(&mut self, path: &str) {
        self.graph
            .remove_edges_touching(&GraphRef::new("file", path));
    }

    fn record_upsert_state(&mut self, state: FileState) {
        match self
            .snapshot
            .files
            .insert(state.path.clone(), state.clone())
        {
            Some(previous) => self.snapshot.operations.push(IndexOperation::Update {
                previous,
                current: state,
            }),
            None => self
                .snapshot
                .operations
                .push(IndexOperation::Create { state }),
        }
    }
}

impl FileState {
    pub fn from_body(path: impl Into<String>, body: &str) -> Self {
        Self {
            path: path.into(),
            mtime_unix_secs: 0,
            size_bytes: body.len() as u64,
            content_hash: stable_hash(body.as_bytes()),
        }
    }

    pub fn from_path_and_bytes(
        rel_path: impl Into<String>,
        path: impl AsRef<Path>,
        bytes: &[u8],
    ) -> io::Result<Self> {
        let metadata = fs::metadata(path)?;
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        let mtime_unix_secs = modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        Ok(Self {
            path: rel_path.into(),
            mtime_unix_secs,
            size_bytes: metadata.len(),
            content_hash: stable_hash(bytes),
        })
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
                .or_else(|| trimmed.strip_prefix("from "))
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
    if query_terms.is_empty() {
        return 0;
    }
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
    split_identifier_terms(value)
        .into_iter()
        .filter(|term| !term.is_empty())
        .map(|term| term.to_ascii_lowercase())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn stable_chunk_id(value: &str) -> u64 {
    value.bytes().fold(0_u64, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(byte as u64)
    })
}

fn stable_hash(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |acc, byte| {
        (acc ^ (*byte as u64)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}

fn split_identifier_terms(value: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut current = String::new();
    let mut previous_lowercase = false;
    for character in value.chars() {
        if !character.is_ascii_alphanumeric() {
            if !current.is_empty() {
                terms.push(std::mem::take(&mut current));
            }
            previous_lowercase = false;
            continue;
        }

        if character.is_ascii_uppercase() && previous_lowercase && !current.is_empty() {
            terms.push(std::mem::take(&mut current));
        }
        previous_lowercase = character.is_ascii_lowercase();
        current.push(character);
    }
    if !current.is_empty() {
        terms.push(current);
    }
    terms
}

fn insert_best_hit(hits: &mut BTreeMap<String, SearchHit>, hit: SearchHit) {
    match hits.get(&hit.path) {
        Some(existing) if existing.score >= hit.score => {}
        _ => {
            hits.insert(hit.path.clone(), hit);
        }
    }
}

fn sort_hits(mut hits: Vec<SearchHit>) -> Vec<SearchHit> {
    hits.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.path.cmp(&right.path))
    });
    hits
}

fn collect_files(
    root: &Path,
    current: &Path,
    ignore_patterns: &[String],
) -> io::Result<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let rel_path = relative_path(root, &path);
        if path.is_dir() {
            if should_skip_dir(&path) || matches_ignore(&rel_path, ignore_patterns) {
                continue;
            }
            paths.extend(collect_files(root, &path, ignore_patterns)?);
        } else if path.is_file() {
            if matches_ignore(&rel_path, ignore_patterns) || is_too_large(&path)? {
                continue;
            }
            paths.push(path);
        }
    }
    Ok(paths)
}

fn should_skip_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(".git" | "target" | "node_modules" | ".fulcrum")
    )
}

fn is_too_large(path: &Path) -> io::Result<bool> {
    Ok(fs::metadata(path)?.len() > 1_000_000)
}

fn is_probably_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0)
}

fn load_ignore_patterns(root: &Path) -> io::Result<Vec<String>> {
    let mut patterns = Vec::new();
    for path in [root.join(".gitignore"), root.join(".fulcrum/ignore")] {
        if !path.exists() {
            continue;
        }
        let content = fs::read_to_string(path)?;
        patterns.extend(
            content
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty() && !line.starts_with('#'))
                .map(|line| line.trim_start_matches('/').to_string()),
        );
    }
    Ok(patterns)
}

fn matches_ignore(rel_path: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| {
        let pattern = pattern.trim_start_matches('/').trim();
        if pattern.is_empty() || pattern.starts_with('!') {
            return false;
        }
        if let Some(prefix) = pattern.strip_suffix('/') {
            rel_path == prefix || rel_path.starts_with(&format!("{prefix}/"))
        } else if pattern.contains('/') {
            wildcard_match(pattern, rel_path)
                || rel_path
                    .split('/')
                    .collect::<Vec<_>>()
                    .windows(pattern.split('/').count())
                    .any(|window| wildcard_match(pattern, &window.join("/")))
        } else {
            rel_path
                .split('/')
                .any(|component| component == pattern || wildcard_match(pattern, component))
        }
    })
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    wildcard_match_bytes(pattern.as_bytes(), value.as_bytes())
}

fn wildcard_match_bytes(pattern: &[u8], value: &[u8]) -> bool {
    let (mut pattern_index, mut value_index) = (0, 0);
    let mut star_index = None;
    let mut star_value_index = 0;
    while value_index < value.len() {
        if pattern_index < pattern.len()
            && (pattern[pattern_index] == b'?' || pattern[pattern_index] == value[value_index])
        {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
            star_index = Some(pattern_index);
            star_value_index = value_index;
            pattern_index += 1;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            star_value_index += 1;
            value_index = star_value_index;
        } else {
            return false;
        }
    }
    while pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
