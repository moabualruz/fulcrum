use fulcrum_code_index::{CodeIndex, SearchSource};

#[test]
fn changed_file_updates_symbols_chunks_and_graph_refs() {
    let mut index = CodeIndex::new();

    index.upsert_file(
        "src/lib.rs",
        "use std::fmt;\n\npub fn old_name() {}\n\nfn helper() {}",
    );
    assert_eq!(index.files()[0].symbols, ["old_name", "helper"]);

    index.upsert_file(
        "src/lib.rs",
        "use crate::events;\n\npub fn new_name() {}\n\npub struct Worker {}\n\npub enum State {}\n\npub trait Runner {}\n\nimpl Worker {}",
    );
    let file = index.files()[0];

    assert_eq!(
        file.symbols,
        ["new_name", "Worker", "State", "Runner", "impl:Worker"]
    );
    assert_eq!(file.imports, ["crate::events"]);
    assert!(index.search("old_name").is_empty());
    assert_eq!(index.search("new_name")[0].source, SearchSource::Lexical);
    assert_eq!(index.graph().edges().len(), 12);
}

#[test]
fn deleted_file_removes_search_and_graph_refs() {
    let mut index = CodeIndex::new();
    index.upsert_file("src/lib.rs", "fn parse_task() {}");

    index.delete_file("src/lib.rs").unwrap();

    assert!(index.search("parse_task").is_empty());
    assert!(index.graph().edges().is_empty());
}
