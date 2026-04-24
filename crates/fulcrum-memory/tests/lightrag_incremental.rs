use fulcrum_memory::MemoryStore;
use std::fs;
use std::path::PathBuf;

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
    assert_eq!(store.full_rebuild_count(), 0);
    assert_eq!(store.tombstones()[0].source_id, source.id);
    assert!(store.retrieval_graph().edges().is_empty());
}

#[test]
fn query_hits_include_l0_provenance() {
    let mut store = MemoryStore::new();
    let source = store.import_markdown("vault/raw/session.md", "agent run decision");

    let hit = store.query("decision")[0].clone();

    assert_eq!(hit.source_id, source.id);
    assert_eq!(hit.provenance, vec![source.id]);
    assert_eq!(hit.explanation.matched_terms, ["decision"]);
    assert!(
        hit.explanation
            .context_pack_summary
            .contains("source_diversity_key")
    );
}

#[test]
fn directory_markdown_import_is_sorted_markdown_only_and_persistent() {
    let root = temp_dir("fulcrum-memory-dir-import");
    fs::create_dir_all(root.join("nested")).unwrap();
    fs::write(root.join("b.md"), "bravo memory").unwrap();
    fs::write(root.join("a.txt"), "ignored").unwrap();
    fs::write(root.join("nested").join("a.markdown"), "alpha memory").unwrap();
    let snapshot = root.join("store").join("memory.snapshot");

    let mut store = MemoryStore::open(&snapshot).unwrap();
    let imported = store.import_markdown_dir(&root).unwrap();

    assert_eq!(imported.len(), 2);
    assert_eq!(imported[0].path, "b.md");
    assert_eq!(imported[1].path, "nested/a.markdown");
    assert_eq!(store.query("memory").len(), 2);

    let reopened = MemoryStore::open(&snapshot).unwrap();
    assert_eq!(
        reopened
            .sources()
            .iter()
            .map(|source| source.path.as_str())
            .collect::<Vec<_>>(),
        ["b.md", "nested/a.markdown"]
    );
    assert_eq!(reopened.query("alpha")[0].path, "nested/a.markdown");
}

#[test]
fn update_and_delete_persist_without_full_rebuild_or_source_reimport() {
    let root = temp_dir("fulcrum-memory-update-delete");
    let snapshot = root.join("memory.snapshot");
    let mut store = MemoryStore::open(&snapshot).unwrap();
    let source = store.import_markdown("docs/decision.md", "initial LightRAG body");
    let import_revision = store.index_revision();

    store
        .update_markdown(&source.id, "changed LightRAG update body")
        .unwrap();
    let updated_revision = store.index_revision();
    store.delete(&source.id).unwrap();

    assert!(updated_revision > import_revision);
    assert_eq!(store.full_rebuild_count(), 0);
    assert_eq!(store.tombstones().len(), 1);

    let reopened = MemoryStore::open(&snapshot).unwrap();
    assert!(reopened.query("changed").is_empty());
    assert_eq!(reopened.tombstones()[0].source_id, source.id);
    assert_eq!(reopened.full_rebuild_count(), 0);
}

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "{}-{}-{}",
        name,
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}
