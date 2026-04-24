#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: String,
}

impl PolicyDecision {
    pub fn allow(reason: impl Into<String>) -> Self {
        Self {
            allowed: true,
            reason: reason.into(),
        }
    }

    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            reason: reason.into(),
        }
    }
}

pub fn evaluate_run_transition(from: &str, to: &str) -> PolicyDecision {
    match (from, to) {
        ("queued", "running")
        | ("running", "blocked")
        | ("running", "completed")
        | ("running", "failed")
        | ("running", "canceled")
        | ("blocked", "running")
        | ("blocked", "failed")
        | ("blocked", "canceled") => PolicyDecision::allow("transition allowed"),
        ("completed" | "failed" | "canceled", _) => {
            PolicyDecision::deny("terminal runs cannot transition")
        }
        _ => PolicyDecision::deny(format!("invalid run transition {from}->{to}")),
    }
}
