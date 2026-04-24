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
    assert!(!zoekt.regex_search);
    assert!(zoekt.path_search);
    assert!(lancedb.vector_search);
    assert!(lancedb.full_text_search);
    assert!(lancedb.hybrid_search);

    let tree_cert = tree_sitter.certification();
    let zoekt_cert = zoekt.certification();
    let lancedb_cert = lancedb.certification();

    assert!(!tree_sitter.external_binary_required);
    assert!(!zoekt.external_binary_required);
    assert!(!lancedb.external_binary_required);
    assert!(!tree_cert.external_binary_invoked);
    assert!(!zoekt_cert.external_binary_invoked);
    assert!(!lancedb_cert.external_binary_invoked);
    assert!(tree_cert.checks.contains(&"emits stable symbol refs"));
    assert!(zoekt_cert.checks.contains(&"exact query contract"));
    assert!(
        zoekt_cert
            .checks
            .contains(&"regex search deferred until external Zoekt binary is invoked")
    );
    assert!(
        lancedb_cert
            .checks
            .contains(&"hybrid result explanation contract")
    );
}
