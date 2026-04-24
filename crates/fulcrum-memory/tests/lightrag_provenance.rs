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
    assert_eq!(hit.source_id, "l0_external_001");
    assert_eq!(hit.path, "vault/raw/session.md");
    assert_eq!(hit.provenance, ["l0_external_001"]);
    assert_eq!(store.graph().edges().len(), 1);
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
