use fulcrum_events::{EventKind, EventStore, LocalEvent};
use fulcrum_graph::{GraphEdge, GraphRef, OsGraph};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const SNAPSHOT_VERSION: &str = "fulcrum-memory-v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathMetadata {
    pub original_path: String,
    pub normalized_path: String,
    pub extension: Option<String>,
    pub content_type: String,
}

impl PathMetadata {
    pub fn markdown(path: impl Into<String>) -> Self {
        let original_path = path.into();
        let normalized_path = normalize_path(&original_path);
        let extension = Path::new(&normalized_path)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase());
        Self {
            original_path,
            normalized_path,
            extension,
            content_type: "text/markdown".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryGraphRefs {
    pub fulcrum_os_ref: GraphRef,
    pub lightrag_document_ref: GraphRef,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemorySource {
    pub id: String,
    pub caller_source_id: Option<String>,
    pub path: String,
    pub path_metadata: PathMetadata,
    pub body_hash: u64,
    pub body: String,
    pub version: u64,
    pub graph_refs: MemoryGraphRefs,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryTombstone {
    pub source_id: String,
    pub caller_source_id: Option<String>,
    pub path_metadata: PathMetadata,
    pub body_hash: u64,
    pub deleted_version: u64,
    pub provenance: Vec<ProvenanceStep>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvenanceStep {
    pub event_id: String,
    pub source_id: String,
    pub action: String,
    pub path: String,
    pub body_hash: u64,
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryExplanation {
    pub source_id: String,
    pub path: String,
    pub query_terms: Vec<String>,
    pub matched_terms: Vec<String>,
    pub score: usize,
    pub stages: Vec<String>,
    pub provenance: Vec<ProvenanceStep>,
    pub graph_refs: MemoryGraphRefs,
    pub context_pack_summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryHit {
    pub source_id: String,
    pub path: String,
    pub score: usize,
    pub provenance: Vec<String>,
    pub explanation: QueryExplanation,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RetrievalGraph {
    edges: Vec<GraphEdge>,
}

impl RetrievalGraph {
    pub fn new() -> Self {
        Self { edges: Vec::new() }
    }

    pub fn link(&mut self, from: GraphRef, relation: impl Into<String>, to: GraphRef) {
        let edge = GraphEdge {
            from,
            relation: relation.into(),
            to,
        };
        if !self.edges.contains(&edge) {
            self.edges.push(edge);
        }
    }

    pub fn edges(&self) -> &[GraphEdge] {
        &self.edges
    }

    pub fn remove_edges_touching(&mut self, node: &GraphRef) {
        self.edges
            .retain(|edge| &edge.from != node && &edge.to != node);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRagCommandPlan {
    pub label: String,
    pub argv: Vec<String>,
    pub purpose: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRagHealthCheck {
    pub label: String,
    pub argv: Vec<String>,
    pub expected_stdout_contains: String,
    pub network_allowed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRagCapability {
    pub operation: String,
    pub supported: bool,
    pub mutates_sidecar: bool,
    pub requires_full_rebuild: bool,
    pub network_allowed_in_tests: bool,
    pub contract: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRagSidecarContract {
    pub install_plan: Vec<LightRagCommandPlan>,
    pub health_check: LightRagHealthCheck,
    pub capability_matrix: Vec<LightRagCapability>,
    pub certification_note: String,
}

impl LightRagSidecarContract {
    pub fn certified_offline_contract() -> Self {
        Self {
            install_plan: vec![
                LightRagCommandPlan {
                    label: "create-venv".to_string(),
                    argv: vec![
                        "python".to_string(),
                        "-m".to_string(),
                        "venv".to_string(),
                        "adapters/lightrag/.venv".to_string(),
                    ],
                    purpose: "isolate LightRAG sidecar runtime".to_string(),
                },
                LightRagCommandPlan {
                    label: "install-offline-extra".to_string(),
                    argv: vec![
                        "pip".to_string(),
                        "install".to_string(),
                        "lightrag-hku[offline]".to_string(),
                    ],
                    purpose: "install LightRAG package with offline deployment extras".to_string(),
                },
            ],
            health_check: LightRagHealthCheck {
                label: "python-import".to_string(),
                argv: vec![
                    "python".to_string(),
                    "-c".to_string(),
                    "from lightrag import LightRAG; print('LightRAG imported')".to_string(),
                ],
                expected_stdout_contains: "LightRAG imported".to_string(),
                network_allowed: false,
            },
            capability_matrix: vec![
                capability("health_check", true, false, false, "import LightRAG locally"),
                capability(
                    "import_markdown",
                    true,
                    true,
                    false,
                    "accept canonical markdown path/body plus Fulcrum source id",
                ),
                capability(
                    "import_l0",
                    true,
                    true,
                    false,
                    "preserve caller-provided l0 source id through sidecar records",
                ),
                capability(
                    "update",
                    true,
                    true,
                    false,
                    "replace source body by id without full rebuild",
                ),
                capability(
                    "delete",
                    true,
                    true,
                    false,
                    "delete source by id and retain Fulcrum tombstone",
                ),
                capability(
                    "query",
                    true,
                    false,
                    false,
                    "return ranked hits with source id, path, score, and provenance trace",
                ),
            ],
            certification_note:
                "Certification tests assert contract shape only; they must not open sockets or call a running sidecar."
                    .to_string(),
        }
    }
}

#[derive(Debug)]
pub struct MemoryStore {
    next_id: u64,
    index_revision: u64,
    full_rebuild_count: u64,
    snapshot_path: Option<PathBuf>,
    sources: BTreeMap<String, MemorySource>,
    tombstones: BTreeMap<String, MemoryTombstone>,
    provenance: BTreeMap<String, Vec<ProvenanceStep>>,
    events: EventStore,
    graph: OsGraph,
    retrieval_graph: RetrievalGraph,
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            index_revision: 0,
            full_rebuild_count: 0,
            snapshot_path: None,
            sources: BTreeMap::new(),
            tombstones: BTreeMap::new(),
            provenance: BTreeMap::new(),
            events: EventStore::new(),
            graph: OsGraph::new(),
            retrieval_graph: RetrievalGraph::new(),
        }
    }

    pub fn open(snapshot_path: impl Into<PathBuf>) -> Result<Self, String> {
        let snapshot_path = snapshot_path.into();
        if !snapshot_path.exists() {
            let mut store = Self::new();
            store.snapshot_path = Some(snapshot_path);
            return Ok(store);
        }

        let contents = fs::read_to_string(&snapshot_path)
            .map_err(|error| format!("failed to read memory snapshot: {error}"))?;
        let mut store = Self::decode_snapshot(&contents)?;
        store.snapshot_path = Some(snapshot_path);
        Ok(store)
    }

    pub fn import_markdown(
        &mut self,
        path: impl Into<String>,
        body: impl Into<String>,
    ) -> MemorySource {
        let path = path.into();
        let source_id = deterministic_source_id(&path);
        self.import_markdown_with_id(source_id, path, body)
            .expect("deterministic memory source id is unique")
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
        let path_metadata = PathMetadata::markdown(path);
        let source = self.build_source(
            source_id.clone(),
            Some(source_id),
            path_metadata,
            body.into(),
            1,
        );
        let source = self.upsert_source(source, EventKind::MemoryImported, "imported")?;
        Ok(source)
    }

    pub fn import_markdown_dir(
        &mut self,
        root: impl AsRef<Path>,
    ) -> Result<Vec<MemorySource>, String> {
        let root = root.as_ref();
        let mut files = Vec::new();
        collect_markdown_files(root, root, &mut files)
            .map_err(|error| format!("failed to scan markdown directory: {error}"))?;
        files.sort();

        let mut imported = Vec::new();
        for relative_path in files {
            let full_path = root.join(&relative_path);
            let body = fs::read_to_string(&full_path)
                .map_err(|error| format!("failed to read markdown file {full_path:?}: {error}"))?;
            imported.push(self.import_markdown(relative_path, body));
        }
        Ok(imported)
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
        source.version += 1;
        self.upsert_source(source, EventKind::MemoryUpdated, "updated")
    }

    pub fn delete(&mut self, source_id: &str) -> Result<(), String> {
        let source = self
            .sources
            .remove(source_id)
            .ok_or_else(|| format!("memory source not found: {source_id}"))?;
        let provenance_event_id = durable_provenance_event_id(self.index_revision + 1);
        self.events.append_with_attributes(
            EventKind::MemoryDeleted,
            source_id,
            "memory source tombstoned",
            [
                ("path", source.path.clone()),
                ("body_hash", source.body_hash.to_string()),
                ("version", source.version.to_string()),
            ],
        );
        let step = provenance_step(provenance_event_id, &source, "deleted");
        self.provenance
            .entry(source.id.clone())
            .or_default()
            .push(step.clone());
        self.tombstones.insert(
            source.id.clone(),
            MemoryTombstone {
                source_id: source.id.clone(),
                caller_source_id: source.caller_source_id.clone(),
                path_metadata: source.path_metadata.clone(),
                body_hash: source.body_hash,
                deleted_version: source.version,
                provenance: self
                    .provenance
                    .get(&source.id)
                    .cloned()
                    .unwrap_or_else(|| vec![step.clone()]),
            },
        );
        self.retrieval_graph
            .remove_edges_touching(&source.graph_refs.lightrag_document_ref);
        self.graph
            .remove_edges_touching(&source.graph_refs.fulcrum_os_ref);
        self.index_revision += 1;
        self.persist_if_configured()?;
        Ok(())
    }

    pub fn query(&self, text: &str) -> Vec<MemoryHit> {
        let query_terms = unique_terms(text);
        let mut hits: Vec<MemoryHit> = self
            .sources
            .values()
            .filter_map(|source| {
                let body_terms = unique_terms(&source.body);
                let matched_terms: Vec<String> = query_terms
                    .iter()
                    .filter(|term| body_terms.contains(*term))
                    .cloned()
                    .collect();
                let score = matched_terms.len();
                (score > 0).then(|| {
                    let provenance = self.provenance.get(&source.id).cloned().unwrap_or_default();
                    MemoryHit {
                        source_id: source.id.clone(),
                        path: source.path.clone(),
                        score,
                        provenance: provenance
                            .iter()
                            .map(|step| step.source_id.clone())
                            .collect::<BTreeSet<_>>()
                            .into_iter()
                            .collect(),
                        explanation: QueryExplanation {
                            source_id: source.id.clone(),
                            path: source.path.clone(),
                            query_terms: query_terms.iter().cloned().collect(),
                            matched_terms,
                            score,
                            stages: vec![
                                "lexical.term_overlap".to_string(),
                                "provenance.raw_markdown".to_string(),
                                "graph.lightrag_sidecar_ref".to_string(),
                            ],
                            provenance,
                            graph_refs: source.graph_refs.clone(),
                            context_pack_summary: format!(
                                "memory:{} path:{} score:{} source_diversity_key:{}",
                                source.id, source.path, score, source.id
                            ),
                        },
                    }
                })
            })
            .collect();
        hits.sort_by(|left, right| {
            right
                .score
                .cmp(&left.score)
                .then_with(|| left.path.cmp(&right.path))
                .then_with(|| left.source_id.cmp(&right.source_id))
        });
        hits
    }

    pub fn sources(&self) -> Vec<&MemorySource> {
        let mut sources: Vec<&MemorySource> = self.sources.values().collect();
        sources.sort_by(|left, right| {
            left.path
                .cmp(&right.path)
                .then_with(|| left.id.cmp(&right.id))
        });
        sources
    }

    pub fn tombstones(&self) -> Vec<&MemoryTombstone> {
        self.tombstones.values().collect()
    }

    pub fn provenance_for(&self, source_id: &str) -> Vec<ProvenanceStep> {
        self.provenance.get(source_id).cloned().unwrap_or_default()
    }

    pub fn events(&self) -> &[LocalEvent] {
        self.events.replay()
    }

    pub fn graph(&self) -> &OsGraph {
        &self.graph
    }

    pub fn retrieval_graph(&self) -> &RetrievalGraph {
        &self.retrieval_graph
    }

    pub fn index_revision(&self) -> u64 {
        self.index_revision
    }

    pub fn full_rebuild_count(&self) -> u64 {
        self.full_rebuild_count
    }

    pub fn lightrag_contract() -> LightRagSidecarContract {
        LightRagSidecarContract::certified_offline_contract()
    }

    fn build_source(
        &mut self,
        source_id: String,
        caller_source_id: Option<String>,
        path_metadata: PathMetadata,
        body: String,
        version: u64,
    ) -> MemorySource {
        self.next_id = self.next_id.max(version + 1);
        let path = path_metadata.normalized_path.clone();
        MemorySource {
            graph_refs: MemoryGraphRefs {
                fulcrum_os_ref: GraphRef::new("memory", source_id.clone()),
                lightrag_document_ref: GraphRef::new("lightrag.document", source_id.clone()),
            },
            id: source_id,
            caller_source_id,
            path,
            path_metadata,
            body_hash: stable_hash(&body),
            body,
            version,
        }
    }

    fn upsert_source(
        &mut self,
        mut source: MemorySource,
        kind: EventKind,
        action: &str,
    ) -> Result<MemorySource, String> {
        source.body_hash = stable_hash(&source.body);
        source.path = source.path_metadata.normalized_path.clone();
        source.graph_refs = MemoryGraphRefs {
            fulcrum_os_ref: GraphRef::new("memory", source.id.clone()),
            lightrag_document_ref: GraphRef::new("lightrag.document", source.id.clone()),
        };
        let path_ref = GraphRef::new("doc", source.path.clone());
        self.graph
            .remove_edges_touching(&source.graph_refs.fulcrum_os_ref);
        self.graph.link(
            source.graph_refs.fulcrum_os_ref.clone(),
            "stored_at",
            path_ref,
        );
        self.retrieval_graph
            .remove_edges_touching(&source.graph_refs.lightrag_document_ref);
        self.retrieval_graph.link(
            source.graph_refs.lightrag_document_ref.clone(),
            "indexes_markdown",
            GraphRef::new("lightrag.source_path", source.path.clone()),
        );
        let provenance_event_id = durable_provenance_event_id(self.index_revision + 1);
        self.events.append_with_attributes(
            kind,
            source.id.clone(),
            "memory source upserted",
            [
                ("path", source.path.clone()),
                ("body_hash", source.body_hash.to_string()),
                ("version", source.version.to_string()),
            ],
        );
        self.provenance
            .entry(source.id.clone())
            .or_default()
            .push(provenance_step(provenance_event_id, &source, action));
        self.tombstones.remove(&source.id);
        self.sources.insert(source.id.clone(), source.clone());
        self.index_revision += 1;
        self.persist_if_configured()?;
        Ok(source)
    }

    fn persist_if_configured(&self) -> Result<(), String> {
        let Some(snapshot_path) = &self.snapshot_path else {
            return Ok(());
        };
        if let Some(parent) = snapshot_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create memory snapshot dir: {error}"))?;
        }
        fs::write(snapshot_path, self.encode_snapshot())
            .map_err(|error| format!("failed to write memory snapshot: {error}"))
    }

    fn encode_snapshot(&self) -> String {
        let mut lines = vec![format!(
            "H\t{}\t{}\t{}\t{}",
            SNAPSHOT_VERSION, self.next_id, self.index_revision, self.full_rebuild_count
        )];
        for source in self.sources.values() {
            lines.push(format!(
                "S\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                encode_field(&source.id),
                encode_field(source.caller_source_id.as_deref().unwrap_or("")),
                encode_field(&source.path_metadata.original_path),
                encode_field(&source.path_metadata.normalized_path),
                source.body_hash,
                source.version,
                encode_field(&source.body),
            ));
        }
        for tombstone in self.tombstones.values() {
            lines.push(format!(
                "T\t{}\t{}\t{}\t{}\t{}\t{}",
                encode_field(&tombstone.source_id),
                encode_field(tombstone.caller_source_id.as_deref().unwrap_or("")),
                encode_field(&tombstone.path_metadata.original_path),
                tombstone.body_hash,
                tombstone.deleted_version,
                encode_field(&tombstone.path_metadata.normalized_path),
            ));
        }
        for (source_id, steps) in &self.provenance {
            for step in steps {
                lines.push(format!(
                    "P\t{}\t{}\t{}\t{}\t{}\t{}",
                    encode_field(source_id),
                    encode_field(&step.event_id),
                    encode_field(&step.action),
                    encode_field(&step.path),
                    step.body_hash,
                    step.version,
                ));
            }
        }
        lines.push(String::new());
        lines.join("\n")
    }

    fn decode_snapshot(contents: &str) -> Result<Self, String> {
        let mut store = Self::new();
        for (line_number, line) in contents.lines().enumerate() {
            if line.is_empty() {
                continue;
            }
            let fields: Vec<&str> = line.split('\t').collect();
            match fields.as_slice() {
                ["H", version, next_id, index_revision, full_rebuild_count]
                    if *version == SNAPSHOT_VERSION =>
                {
                    store.next_id = next_id
                        .parse()
                        .map_err(|_| format!("invalid next_id on line {}", line_number + 1))?;
                    store.index_revision = index_revision.parse().map_err(|_| {
                        format!("invalid index_revision on line {}", line_number + 1)
                    })?;
                    store.full_rebuild_count = full_rebuild_count.parse().map_err(|_| {
                        format!("invalid full_rebuild_count on line {}", line_number + 1)
                    })?;
                }
                [
                    "S",
                    id,
                    caller_source_id,
                    original_path,
                    normalized_path,
                    body_hash,
                    version,
                    body,
                ] => {
                    let path_metadata = PathMetadata::markdown(decode_field(original_path)?);
                    let path_metadata = PathMetadata {
                        normalized_path: decode_field(normalized_path)?,
                        ..path_metadata
                    };
                    let source_id = decode_field(id)?;
                    let body = decode_field(body)?;
                    let source = MemorySource {
                        graph_refs: MemoryGraphRefs {
                            fulcrum_os_ref: GraphRef::new("memory", source_id.clone()),
                            lightrag_document_ref: GraphRef::new(
                                "lightrag.document",
                                source_id.clone(),
                            ),
                        },
                        id: source_id.clone(),
                        caller_source_id: optional_field(caller_source_id)?,
                        path: path_metadata.normalized_path.clone(),
                        path_metadata,
                        body_hash: body_hash.parse().map_err(|_| {
                            format!("invalid body_hash on line {}", line_number + 1)
                        })?,
                        body,
                        version: version
                            .parse()
                            .map_err(|_| format!("invalid version on line {}", line_number + 1))?,
                    };
                    store.graph.link(
                        source.graph_refs.fulcrum_os_ref.clone(),
                        "stored_at",
                        GraphRef::new("doc", source.path.clone()),
                    );
                    store.retrieval_graph.link(
                        source.graph_refs.lightrag_document_ref.clone(),
                        "indexes_markdown",
                        GraphRef::new("lightrag.source_path", source.path.clone()),
                    );
                    store.sources.insert(source.id.clone(), source);
                }
                [
                    "T",
                    source_id,
                    caller_source_id,
                    original_path,
                    body_hash,
                    deleted_version,
                    normalized_path,
                ] => {
                    let path_metadata = PathMetadata::markdown(decode_field(original_path)?);
                    let path_metadata = PathMetadata {
                        normalized_path: decode_field(normalized_path)?,
                        ..path_metadata
                    };
                    let source_id = decode_field(source_id)?;
                    store.tombstones.insert(
                        source_id.clone(),
                        MemoryTombstone {
                            source_id,
                            caller_source_id: optional_field(caller_source_id)?,
                            path_metadata,
                            body_hash: body_hash.parse().map_err(|_| {
                                format!("invalid tombstone body_hash on line {}", line_number + 1)
                            })?,
                            deleted_version: deleted_version.parse().map_err(|_| {
                                format!(
                                    "invalid tombstone deleted_version on line {}",
                                    line_number + 1
                                )
                            })?,
                            provenance: Vec::new(),
                        },
                    );
                }
                ["P", source_id, event_id, action, path, body_hash, version] => {
                    let source_id = decode_field(source_id)?;
                    let step = ProvenanceStep {
                        event_id: decode_field(event_id)?,
                        source_id: source_id.clone(),
                        action: decode_field(action)?,
                        path: decode_field(path)?,
                        body_hash: body_hash.parse().map_err(|_| {
                            format!("invalid provenance body_hash on line {}", line_number + 1)
                        })?,
                        version: version.parse().map_err(|_| {
                            format!("invalid provenance version on line {}", line_number + 1)
                        })?,
                    };
                    store.provenance.entry(source_id).or_default().push(step);
                }
                ["H", version, ..] => {
                    return Err(format!("unsupported memory snapshot version: {version}"));
                }
                _ => return Err(format!("invalid memory snapshot line {}", line_number + 1)),
            }
        }

        for tombstone in store.tombstones.values_mut() {
            tombstone.provenance = store
                .provenance
                .get(&tombstone.source_id)
                .cloned()
                .unwrap_or_default();
        }

        Ok(store)
    }
}

fn capability(
    operation: &str,
    supported: bool,
    mutates_sidecar: bool,
    requires_full_rebuild: bool,
    contract: &str,
) -> LightRagCapability {
    LightRagCapability {
        operation: operation.to_string(),
        supported,
        mutates_sidecar,
        requires_full_rebuild,
        network_allowed_in_tests: false,
        contract: contract.to_string(),
    }
}

fn durable_provenance_event_id(index_revision: u64) -> String {
    format!("mem_evt_{index_revision:012}")
}

fn provenance_step(event_id: String, source: &MemorySource, action: &str) -> ProvenanceStep {
    ProvenanceStep {
        event_id,
        source_id: source.id.clone(),
        action: action.to_string(),
        path: source.path.clone(),
        body_hash: source.body_hash,
        version: source.version,
    }
}

fn stable_hash(value: &str) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    value.as_bytes().iter().fold(FNV_OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME)
    })
}

fn deterministic_source_id(path: &str) -> String {
    format!("l0_{:016x}", stable_hash(&normalize_path(path)))
}

fn unique_terms(value: &str) -> BTreeSet<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|term| !term.is_empty())
        .map(|term| term.to_ascii_lowercase())
        .collect()
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn collect_markdown_files(root: &Path, current: &Path, files: &mut Vec<String>) -> io::Result<()> {
    let mut entries = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            collect_markdown_files(root, &path, files)?;
            continue;
        }
        if !is_markdown_path(&path) {
            continue;
        }
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        files.push(normalize_path(&relative_path));
    }
    Ok(())
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown")
    )
}

fn encode_field(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'%' => encoded.push_str("%25"),
            b'\t' => encoded.push_str("%09"),
            b'\n' => encoded.push_str("%0A"),
            b'\r' => encoded.push_str("%0D"),
            byte => encoded.push(char::from(*byte)),
        }
    }
    encoded
}

fn decode_field(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 2 >= bytes.len() {
            return Err("invalid percent encoding in memory snapshot".to_string());
        }
        let hex = &value[index + 1..index + 3];
        let byte = u8::from_str_radix(hex, 16)
            .map_err(|_| "invalid percent encoding in memory snapshot".to_string())?;
        decoded.push(byte);
        index += 3;
    }
    String::from_utf8(decoded).map_err(|_| "invalid utf-8 in memory snapshot".to_string())
}

fn optional_field(value: &str) -> Result<Option<String>, String> {
    let value = decode_field(value)?;
    Ok((!value.is_empty()).then_some(value))
}
