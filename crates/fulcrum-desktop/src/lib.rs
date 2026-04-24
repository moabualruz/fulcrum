use fulcrum_kernel::{AdapterHealth, Kernel};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CockpitSnapshot {
    pub tasks_open: usize,
    pub tasks_running: usize,
    pub tasks_done: usize,
    pub active_runs: usize,
    pub health: Vec<AdapterHealth>,
    pub event_count: usize,
}

pub fn build_snapshot(kernel: &Kernel) -> CockpitSnapshot {
    let snapshot = kernel.operator_snapshot();
    CockpitSnapshot {
        tasks_open: snapshot.tasks_open,
        tasks_running: snapshot.tasks_running,
        tasks_done: snapshot.tasks_done,
        active_runs: snapshot.active_runs,
        health: snapshot.health,
        event_count: snapshot.event_count,
    }
}
