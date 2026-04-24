use fulcrum_memory::MemoryStore;

#[test]
fn markdown_import_update_and_delete_affect_queries_without_rebuild() {
    let mut store = MemoryStore::new();

    let source = store.import_markdown(
        "docs/plans/local.md",
        "LightRAG preserves provenance for markdown memories.",
    );
    assert_eq!(store.query("provenance").len(), 1);

    store
        .update_markdown(&source.id, "LightRAG now covers deletion behavior.")
        .unwrap();
    assert!(store.query("provenance").is_empty());
    assert_eq!(store.query("deletion")[0].source_id, source.id);

    store.delete(&source.id).unwrap();
    assert!(store.query("deletion").is_empty());
    assert!(store.graph().edges().is_empty());
}

#[test]
fn query_hits_include_l0_provenance() {
    let mut store = MemoryStore::new();
    let source = store.import_markdown("vault/raw/session.md", "agent run decision");

    let hit = store.query("decision")[0].clone();

    assert_eq!(hit.source_id, source.id);
    assert_eq!(hit.provenance, vec![source.id]);
}
