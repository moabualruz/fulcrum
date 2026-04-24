#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeSitterContract {
    pub parser: &'static str,
    pub incremental_updates: bool,
    pub owns_symbols: bool,
    pub external_binary_required: bool,
    pub certified_checks: Vec<&'static str>,
}

impl Default for TreeSitterContract {
    fn default() -> Self {
        Self {
            parser: "tree-sitter",
            incremental_updates: true,
            owns_symbols: true,
            external_binary_required: false,
            certified_checks: vec![
                "parses fixture source in-process",
                "emits stable symbol refs",
                "supports changed range ownership",
            ],
        }
    }
}

impl TreeSitterContract {
    pub fn certification(&self) -> AdapterCertification {
        AdapterCertification {
            adapter: self.parser,
            external_binary_invoked: false,
            checks: self.certified_checks.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterCertification {
    pub adapter: &'static str,
    pub external_binary_invoked: bool,
    pub checks: Vec<&'static str>,
}
