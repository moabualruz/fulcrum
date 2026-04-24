#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZoektContract {
    pub indexer: &'static str,
    pub exact_search: bool,
    pub regex_search: bool,
    pub path_search: bool,
    pub external_binary_required: bool,
    pub certified_checks: Vec<&'static str>,
}

impl Default for ZoektContract {
    fn default() -> Self {
        Self {
            indexer: "zoekt",
            exact_search: true,
            regex_search: false,
            path_search: true,
            external_binary_required: false,
            certified_checks: vec![
                "exact query contract",
                "path query contract",
                "incremental delete contract",
                "regex search deferred until external Zoekt binary is invoked",
            ],
        }
    }
}

impl ZoektContract {
    pub fn certification(&self) -> ZoektCertification {
        ZoektCertification {
            adapter: self.indexer,
            external_binary_invoked: false,
            checks: self.certified_checks.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZoektCertification {
    pub adapter: &'static str,
    pub external_binary_invoked: bool,
    pub checks: Vec<&'static str>,
}
