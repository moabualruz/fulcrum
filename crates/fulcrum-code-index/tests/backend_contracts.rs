use fulcrum_code_index::{
    lancedb::LanceDbContract, tree_sitter::TreeSitterContract, zoekt::ZoektContract,
};

#[test]
fn selected_code_backends_have_explicit_contracts() {
    let tree_sitter = TreeSitterContract::default();
    let zoekt = ZoektContract::default();
    let lancedb = LanceDbContract::default();

    assert!(tree_sitter.incremental_updates);
    assert!(tree_sitter.owns_symbols);
    assert!(zoekt.exact_search);
    assert!(zoekt.regex_search);
    assert!(zoekt.path_search);
    assert!(lancedb.vector_search);
    assert!(lancedb.full_text_search);
    assert!(lancedb.hybrid_search);
}
