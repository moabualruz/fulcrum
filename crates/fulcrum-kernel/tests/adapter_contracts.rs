use fulcrum_kernel::{
    AdapterCapability, AdapterStatus, Kernel, ProductAdapter, default_product_adapters,
};

#[test]
fn default_adapters_cover_selected_products() {
    let adapters = default_product_adapters();
    let keys: Vec<&str> = adapters.iter().map(|adapter| adapter.key()).collect();

    assert_eq!(keys, ["plane", "windmill", "lightrag", "zoekt", "lancedb"]);
    assert_eq!(adapters[0].capability(), AdapterCapability::PmSurface);
}

#[test]
fn health_report_is_explicit_when_adapters_are_missing() {
    let mut kernel = Kernel::new();

    let health = kernel.check_adapter_health();

    assert_eq!(health.adapters.len(), 5);
    assert!(
        health
            .adapters
            .iter()
            .all(|adapter| adapter.status == AdapterStatus::Missing)
    );
    assert!(health.event_count >= 5);
}

#[test]
fn external_ids_map_to_fulcrum_refs_without_owning_state() {
    let mut kernel = Kernel::new();

    let plane = kernel.map_external_ref("plane", "work_item", "PLN-42", "task_000001");
    let windmill = kernel.map_external_ref("windmill", "job", "job_123", "action:act_000001");

    assert_eq!(plane.fulcrum_ref, "task_000001");
    assert_eq!(windmill.fulcrum_ref, "action:act_000001");
    assert_eq!(kernel.external_mappings().len(), 2);
}
