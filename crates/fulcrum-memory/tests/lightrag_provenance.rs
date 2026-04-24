use fulcrum_memory::MemoryStore;

#[test]
fn caller_provided_l0_source_id_flows_through_query_and_graph() {
    let mut store = MemoryStore::new();

    let source = store
        .import_markdown_with_id(
            "l0_external_001",
            "vault/raw/session.md",
            "LightRAG source id provenance trace",
        )
        .unwrap();
    let hit = store.query("provenance")[0].clone();

    assert_eq!(source.id, "l0_external_001");
    assert_eq!(source.caller_source_id.as_deref(), Some("l0_external_001"));
    assert_eq!(source.path_metadata.normalized_path, "vault/raw/session.md");
    assert_eq!(hit.source_id, "l0_external_001");
    assert_eq!(hit.path, "vault/raw/session.md");
    assert_eq!(hit.provenance, ["l0_external_001"]);
    assert_eq!(store.graph().edges().len(), 1);
    assert_eq!(store.retrieval_graph().edges().len(), 1);
}

#[test]
fn duplicate_caller_source_id_is_rejected() {
    let mut store = MemoryStore::new();
    store
        .import_markdown_with_id("l0_external_001", "first.md", "first body")
        .unwrap();

    let duplicate = store.import_markdown_with_id("l0_external_001", "second.md", "second body");

    assert!(duplicate.is_err());
}

#[test]
fn provenance_trace_records_import_update_delete_with_versions() {
    let mut store = MemoryStore::new();
    let source = store
        .import_markdown_with_id("l0_trace_001", "raw/trace.md", "first provenance body")
        .unwrap();

    store
        .update_markdown(&source.id, "second provenance body")
        .unwrap();
    store.delete(&source.id).unwrap();

    let trace = store.provenance_for(&source.id);
    assert_eq!(
        trace
            .iter()
            .map(|step| step.action.as_str())
            .collect::<Vec<_>>(),
        ["imported", "updated", "deleted"]
    );
    assert_eq!(
        trace.iter().map(|step| step.version).collect::<Vec<_>>(),
        [1, 2, 2]
    );
    assert_eq!(store.tombstones()[0].provenance, trace);
    assert!(store.graph().edges().is_empty());
    assert!(store.retrieval_graph().edges().is_empty());
}

#[test]
fn lightrag_graph_refs_remain_separate_from_fulcrum_os_graph() {
    let mut store = MemoryStore::new();
    let source = store.import_markdown("docs/graph.md", "graph separation memory");

    assert!(
        store.graph().edges().iter().all(
            |edge| edge.from.kind != "lightrag.document" && edge.to.kind != "lightrag.document"
        )
    );
    assert!(
        store
            .retrieval_graph()
            .edges()
            .iter()
            .any(|edge| edge.from == source.graph_refs.lightrag_document_ref)
    );
    assert_ne!(
        source.graph_refs.fulcrum_os_ref.kind,
        source.graph_refs.lightrag_document_ref.kind
    );
}

#[test]
fn lightrag_certification_matrix_is_offline_and_complete() {
    let contract = MemoryStore::lightrag_contract();
    let operations = contract
        .capability_matrix
        .iter()
        .map(|capability| capability.operation.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        operations,
        [
            "health_check",
            "import_markdown",
            "import_l0",
            "update",
            "delete",
            "query"
        ]
    );
    assert!(
        contract
            .install_plan
            .iter()
            .any(|command| command.argv.join(" ").contains("lightrag-hku[offline]"))
    );
    assert!(!contract.health_check.network_allowed);
    assert!(
        contract
            .capability_matrix
            .iter()
            .all(|capability| capability.supported
                && !capability.network_allowed_in_tests
                && !capability.requires_full_rebuild)
    );
}
