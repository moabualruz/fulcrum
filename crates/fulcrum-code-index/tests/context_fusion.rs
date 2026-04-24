use fulcrum_code_index::{CodeIndex, SearchSource};

#[test]
fn exact_identifier_beats_semantic_hit() {
    let mut index = CodeIndex::new();
    index.upsert_file("src/exact.rs", "fn start_agent_run() {}");
    index.upsert_file(
        "src/semantic.rs",
        "the agent run lifecycle starts when a task is claimed",
    );

    let hits = index.search("start_agent_run");

    assert_eq!(hits[0].path, "src/exact.rs");
    assert_eq!(hits[0].source, SearchSource::Lexical);
}
