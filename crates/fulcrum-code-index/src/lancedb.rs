#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanceDbContract {
    pub store: &'static str,
    pub vector_search: bool,
    pub full_text_search: bool,
    pub hybrid_search: bool,
    pub external_binary_required: bool,
    pub certified_checks: Vec<&'static str>,
}

impl Default for LanceDbContract {
    fn default() -> Self {
        Self {
            store: "lancedb",
            vector_search: true,
            full_text_search: true,
            hybrid_search: true,
            external_binary_required: false,
            certified_checks: vec![
                "semantic chunk contract",
                "hybrid result explanation contract",
                "delete removes chunk refs contract",
            ],
        }
    }
}

impl LanceDbContract {
    pub fn certification(&self) -> LanceDbCertification {
        LanceDbCertification {
            adapter: self.store,
            external_binary_invoked: false,
            checks: self.certified_checks.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanceDbCertification {
    pub adapter: &'static str,
    pub external_binary_invoked: bool,
    pub checks: Vec<&'static str>,
}
