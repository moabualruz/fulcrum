#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZoektContract {
    pub indexer: &'static str,
    pub exact_search: bool,
    pub regex_search: bool,
    pub path_search: bool,
}

impl Default for ZoektContract {
    fn default() -> Self {
        Self {
            indexer: "zoekt",
            exact_search: true,
            regex_search: true,
            path_search: true,
        }
    }
}
