#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeSitterContract {
    pub parser: &'static str,
    pub incremental_updates: bool,
    pub owns_symbols: bool,
}

impl Default for TreeSitterContract {
    fn default() -> Self {
        Self {
            parser: "tree-sitter",
            incremental_updates: true,
            owns_symbols: true,
        }
    }
}
