use fulcrum_code_index::{CodeIndex, IndexOperation, SearchKind, SearchSource, StaleReason};
use fulcrum_graph::GraphRef;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn indexes_real_fixture_repo_with_snapshot_and_search_modes() {
    let root = fixture_repo("real-fixture");
    write_file(
        &root,
        "src/lib.rs",
        "use crate::worker::Worker;\n\npub fn start_agent_run() {}\n",
    );
    write_file(
        &root,
        "src/worker.rs",
        "pub struct Worker {}\n\nimpl Worker {}\n",
    );
    write_file(&root, "README.md", "agent run lifecycle notes\n");

    let mut index = CodeIndex::new();
    let indexed = index.index_repo(&root).unwrap();

    assert_eq!(indexed.len(), 3);
    assert_eq!(index.snapshot().files.len(), 3);
    assert!(matches!(
        index.snapshot().operations[0],
        IndexOperation::Create { .. }
    ));
    assert_eq!(index.symbol_search("start_agent_run")[0].path, "src/lib.rs");
    assert_eq!(index.path_search("worker.rs")[0].path, "src/worker.rs");
    assert_eq!(index.import_search("crate::worker")[0].path, "src/lib.rs");

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rename_and_delete_incremental_update_preserves_snapshot_history() {
    let mut index = CodeIndex::new();
    index
        .create_file("src/old.rs", "pub fn old_symbol() {}\n")
        .unwrap();
    index
        .update_file("src/old.rs", "pub fn renamed_symbol() {}\n")
        .unwrap();

    index.rename_file("src/old.rs", "src/new.rs").unwrap();
    assert!(index.search("src/old.rs").is_empty());
    assert_eq!(index.symbol_search("renamed_symbol")[0].path, "src/new.rs");
    assert!(index.snapshot().files.contains_key("src/new.rs"));
    assert!(!index.snapshot().files.contains_key("src/old.rs"));

    index.delete_file("src/new.rs").unwrap();
    assert!(index.search("renamed_symbol").is_empty());
    assert!(index.snapshot().files.is_empty());
    assert!(matches!(
        index.snapshot().operations.last().unwrap(),
        IndexOperation::Delete { .. }
    ));
}

#[test]
fn import_graph_refs_are_queryable() {
    let mut index = CodeIndex::new();
    index.upsert_file(
        "src/lib.rs",
        "use crate::scheduler::TaskQueue;\n\npub fn start() {}\n",
    );

    let file_ref = GraphRef::new("file", "src/lib.rs");
    let import_ref = GraphRef::new("import", "crate::scheduler::TaskQueue");
    assert!(index.graph().has_link(&file_ref, "imports", &import_ref));
    assert_eq!(index.import_search("TaskQueue")[0].kind, SearchKind::Import);
}

#[test]
fn context_pack_explains_exact_vs_semantic_results() {
    let mut index = CodeIndex::new();
    index.upsert_file("src/exact.rs", "pub fn start_agent_run() {}\n");
    index.upsert_file(
        "src/semantic.rs",
        "start agent run lifecycle begins when a task is claimed\n",
    );

    let pack = index.context_pack("start_agent_run", 2);

    assert_eq!(pack.results[0].path, "src/exact.rs");
    assert_eq!(pack.results[0].source, SearchSource::Lexical);
    assert_eq!(pack.results[0].kind, SearchKind::Symbol);
    assert!(pack.results[0].explanation.contains("symbol match"));
    assert_eq!(pack.results[1].path, "src/semantic.rs");
    assert_eq!(pack.results[1].source, SearchSource::Semantic);
    assert!(
        pack.results[1]
            .explanation
            .contains("semantic terms matched")
    );
}

#[test]
fn stale_index_detection_reports_modified_and_missing_files() {
    let root = fixture_repo("stale-fixture");
    write_file(&root, "src/lib.rs", "pub fn stable() {}\n");
    write_file(&root, "src/delete_me.rs", "pub fn delete_me() {}\n");

    let mut index = CodeIndex::new();
    index.index_repo(&root).unwrap();
    write_file(&root, "src/lib.rs", "pub fn changed() {}\n");
    fs::remove_file(root.join("src/delete_me.rs")).unwrap();

    let stale = index.stale_files(&root).unwrap();

    assert_eq!(stale.len(), 2);
    assert!(
        stale
            .iter()
            .any(|file| file.path == "src/lib.rs" && file.reason == StaleReason::Modified)
    );
    assert!(
        stale
            .iter()
            .any(|file| file.path == "src/delete_me.rs" && file.reason == StaleReason::Missing)
    );

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn repo_reindex_applies_deletes_and_respects_ignore_and_binary_skips() {
    let root = fixture_repo("reindex-fixture");
    write_file(
        &root,
        ".gitignore",
        "*.log\nignored-dir/\nsecrets/*.env\nbuild/**\n",
    );
    write_file(&root, "src/keep.rs", "pub fn keep_symbol() {}\n");
    write_file(&root, "src/remove.rs", "pub fn remove_symbol() {}\n");
    write_file(&root, "src/rewrite.rs", "pub fn stale_after_binary() {}\n");
    write_file(&root, "ignored.log", "secret token should not index\n");
    write_file(&root, "ignored-dir/skip.rs", "pub fn skip_me() {}\n");
    write_file(&root, "secrets/local.env", "private key should not index\n");
    write_file(&root, "build/generated.rs", "pub fn generated_skip() {}\n");
    fs::write(root.join("src/blob.bin"), b"abc\0def").unwrap();

    let mut index = CodeIndex::new();
    index.index_repo(&root).unwrap();
    assert_eq!(index.symbol_search("keep_symbol").len(), 1);
    assert!(index.search("secret token").is_empty());
    assert!(index.symbol_search("skip_me").is_empty());
    assert!(index.search("private key").is_empty());
    assert!(index.symbol_search("generated_skip").is_empty());
    assert!(index.search("blob").is_empty());

    fs::remove_file(root.join("src/remove.rs")).unwrap();
    fs::write(root.join("src/rewrite.rs"), b"now\0binary").unwrap();
    index.index_repo(&root).unwrap();

    assert!(index.symbol_search("remove_symbol").is_empty());
    assert!(index.symbol_search("stale_after_binary").is_empty());
    assert!(!index.snapshot().files.contains_key("src/remove.rs"));
    assert!(!index.snapshot().files.contains_key("src/rewrite.rs"));

    fs::remove_dir_all(root).unwrap();
}

fn fixture_repo(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let root = std::env::temp_dir().join(format!(
        "fulcrum-code-index-{name}-{}-{nanos}",
        std::process::id()
    ));
    fs::create_dir_all(root.join("src")).unwrap();
    root
}

fn write_file(root: &Path, path: &str, body: &str) {
    let path = root.join(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, body).unwrap();
}
