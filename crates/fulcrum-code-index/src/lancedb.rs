#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanceDbContract {
    pub store: &'static str,
    pub vector_search: bool,
    pub full_text_search: bool,
    pub hybrid_search: bool,
}

impl Default for LanceDbContract {
    fn default() -> Self {
        Self {
            store: "lancedb",
            vector_search: true,
            full_text_search: true,
            hybrid_search: true,
        }
    }
}
