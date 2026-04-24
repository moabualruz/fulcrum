use fulcrum_events::{EventKind, EventStore, LocalEvent};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionRequest {
    pub id: String,
    pub adapter_key: String,
    pub action_name: String,
    pub fulcrum_ref: String,
}

#[derive(Debug, Default)]
pub struct ActionOrchestrator {
    next_id: u64,
    requests: Vec<ActionRequest>,
    events: EventStore,
}

impl ActionOrchestrator {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            requests: Vec::new(),
            events: EventStore::new(),
        }
    }

    pub fn request_human_action(
        &mut self,
        adapter_key: impl Into<String>,
        action_name: impl Into<String>,
        fulcrum_ref: impl Into<String>,
    ) -> ActionRequest {
        let request = ActionRequest {
            id: format!("act_{:06}", self.next_id),
            adapter_key: adapter_key.into(),
            action_name: action_name.into(),
            fulcrum_ref: fulcrum_ref.into(),
        };
        self.next_id += 1;
        self.events.append_with_attributes(
            EventKind::ActionRequested,
            request.id.clone(),
            "human-triggered action requested",
            [
                ("adapter", request.adapter_key.as_str()),
                ("action", request.action_name.as_str()),
                ("fulcrum_ref", request.fulcrum_ref.as_str()),
            ],
        );
        self.requests.push(request.clone());
        request
    }

    pub fn requests(&self) -> &[ActionRequest] {
        &self.requests
    }

    pub fn events(&self) -> &[LocalEvent] {
        self.events.replay()
    }
}
