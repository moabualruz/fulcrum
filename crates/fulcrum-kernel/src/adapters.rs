#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdapterCapability {
    PmSurface,
    ActionWorkflow,
    MemoryGraphRag,
    CodeLexicalSearch,
    CodeSemanticSearch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdapterBoundary {
    ExternalSurface,
    SidecarEngine,
    ManagedIndex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdapterStatus {
    Missing,
    Available,
}

impl AdapterStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Available => "available",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterHealth {
    pub key: String,
    pub status: AdapterStatus,
    pub message: String,
}

pub trait ProductAdapter {
    fn key(&self) -> &str;
    fn capability(&self) -> AdapterCapability;
    fn boundary(&self) -> AdapterBoundary;
    fn health(&self) -> AdapterHealth;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalMapping {
    pub adapter_key: String,
    pub external_kind: String,
    pub external_id: String,
    pub fulcrum_ref: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StubProductAdapter {
    key: String,
    capability: AdapterCapability,
    boundary: AdapterBoundary,
    installed: bool,
}

impl StubProductAdapter {
    pub fn new(
        key: impl Into<String>,
        capability: AdapterCapability,
        boundary: AdapterBoundary,
    ) -> Self {
        Self {
            key: key.into(),
            capability,
            boundary,
            installed: false,
        }
    }
}

impl ProductAdapter for StubProductAdapter {
    fn key(&self) -> &str {
        &self.key
    }

    fn capability(&self) -> AdapterCapability {
        self.capability
    }

    fn boundary(&self) -> AdapterBoundary {
        self.boundary
    }

    fn health(&self) -> AdapterHealth {
        if self.installed {
            AdapterHealth {
                key: self.key.clone(),
                status: AdapterStatus::Available,
                message: format!("{} adapter available", self.key),
            }
        } else {
            AdapterHealth {
                key: self.key.clone(),
                status: AdapterStatus::Missing,
                message: format!("{} adapter not configured", self.key),
            }
        }
    }
}

pub fn default_product_adapters() -> Vec<StubProductAdapter> {
    vec![
        StubProductAdapter::new(
            "plane",
            AdapterCapability::PmSurface,
            AdapterBoundary::ExternalSurface,
        ),
        StubProductAdapter::new(
            "windmill",
            AdapterCapability::ActionWorkflow,
            AdapterBoundary::ExternalSurface,
        ),
        StubProductAdapter::new(
            "lightrag",
            AdapterCapability::MemoryGraphRag,
            AdapterBoundary::SidecarEngine,
        ),
        StubProductAdapter::new(
            "zoekt",
            AdapterCapability::CodeLexicalSearch,
            AdapterBoundary::ManagedIndex,
        ),
        StubProductAdapter::new(
            "lancedb",
            AdapterCapability::CodeSemanticSearch,
            AdapterBoundary::ManagedIndex,
        ),
    ]
}
