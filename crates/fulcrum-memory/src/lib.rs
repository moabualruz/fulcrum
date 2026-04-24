use fulcrum_events::{EventKind, EventStore, LocalEvent};
use fulcrum_graph::{GraphRef, OsGraph};
use std::collections::BTreeMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemorySource {
    pub id: String,
    pub path: String,
    pub body_hash: u64,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryHit {
    pub source_id: String,
    pub path: String,
    pub score: usize,
    pub provenance: Vec<String>,
}

#[derive(Debug, Default)]
pub struct MemoryStore {
    next_id: u64,
    sources: BTreeMap<String, MemorySource>,
    events: EventStore,
    graph: OsGraph,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            sources: BTreeMap::new(),
            events: EventStore::new(),
            graph: OsGraph::new(),
        }
    }

    pub fn import_markdown(
        &mut self,
        path: impl Into<String>,
        body: impl Into<String>,
    ) -> MemorySource {
        let source_id = format!("l0_{:06}", self.next_id);
        self.next_id += 1;
        self.import_markdown_with_id(source_id, path, body)
            .expect("generated memory source id is unique")
    }

    pub fn import_markdown_with_id(
        &mut self,
        source_id: impl Into<String>,
        path: impl Into<String>,
        body: impl Into<String>,
    ) -> Result<MemorySource, String> {
        let source_id = source_id.into();
        if self.sources.contains_key(&source_id) {
            return Err(format!("memory source already exists: {source_id}"));
        }
        let source = MemorySource {
            id: source_id,
            path: path.into(),
            body: body.into(),
            body_hash: 0,
        };
        Ok(self.upsert_source(source, EventKind::MemoryImported))
    }

    pub fn update_markdown(
        &mut self,
        source_id: &str,
        body: impl Into<String>,
    ) -> Result<MemorySource, String> {
        let mut source = self
            .sources
            .get(source_id)
            .cloned()
            .ok_or_else(|| format!("memory source not found: {source_id}"))?;
        source.body = body.into();
        Ok(self.upsert_source(source, EventKind::MemoryUpdated))
    }

    pub fn delete(&mut self, source_id: &str) -> Result<(), String> {
        self.sources
            .remove(source_id)
            .ok_or_else(|| format!("memory source not found: {source_id}"))?;
        let memory_ref = GraphRef::new("memory", source_id);
        self.graph.remove_edges_touching(&memory_ref);
        self.events
            .append(EventKind::MemoryDeleted, source_id, "memory source deleted");
        Ok(())
    }

    pub fn query(&self, text: &str) -> Vec<MemoryHit> {
        let query_terms = terms(text);
        let mut hits: Vec<MemoryHit> = self
            .sources
            .values()
            .filter_map(|source| {
                let body_terms = terms(&source.body);
                let score = query_terms
                    .iter()
                    .filter(|term| body_terms.contains(term))
                    .count();
                (score > 0).then(|| MemoryHit {
                    source_id: source.id.clone(),
                    path: source.path.clone(),
                    score,
                    provenance: vec![source.id.clone()],
                })
            })
            .collect();
        hits.sort_by(|left, right| right.score.cmp(&left.score));
        hits
    }

    pub fn sources(&self) -> Vec<&MemorySource> {
        self.sources.values().collect()
    }

    pub fn events(&self) -> &[LocalEvent] {
        self.events.replay()
    }

    pub fn graph(&self) -> &OsGraph {
        &self.graph
    }

    fn upsert_source(&mut self, mut source: MemorySource, kind: EventKind) -> MemorySource {
        source.body_hash = stable_hash(&source.body);
        let memory_ref = GraphRef::new("memory", &source.id);
        let path_ref = GraphRef::new("doc", &source.path);
        self.graph.remove_edges_touching(&memory_ref);
        self.graph.link(memory_ref, "stored_at", path_ref);
        self.events
            .append(kind, source.id.clone(), "memory source upserted");
        self.sources.insert(source.id.clone(), source.clone());
        source
    }
}

fn stable_hash(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn terms(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(|term| term.to_ascii_lowercase())
        .collect()
}
