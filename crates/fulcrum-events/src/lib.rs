use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventKind {
    WorkspaceCreated,
    ProjectCreated,
    TaskCreated,
    RunStarted,
    RunHeartbeat,
    RunBlocked,
    RunCompleted,
    RunCanceled,
    RunFailed,
    AdapterHealthChecked,
    ActionRequested,
    IndexUpdated,
    MemoryImported,
    MemoryUpdated,
    MemoryDeleted,
    GraphLinked,
    CockpitSnapshotRequested,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::WorkspaceCreated => "workspace.created",
            Self::ProjectCreated => "project.created",
            Self::TaskCreated => "task.created",
            Self::RunStarted => "run.started",
            Self::RunHeartbeat => "run.heartbeat",
            Self::RunBlocked => "run.blocked",
            Self::RunCompleted => "run.completed",
            Self::RunCanceled => "run.canceled",
            Self::RunFailed => "run.failed",
            Self::AdapterHealthChecked => "adapter.health_checked",
            Self::ActionRequested => "action.requested",
            Self::IndexUpdated => "index.updated",
            Self::MemoryImported => "memory.imported",
            Self::MemoryUpdated => "memory.updated",
            Self::MemoryDeleted => "memory.deleted",
            Self::GraphLinked => "graph.linked",
            Self::CockpitSnapshotRequested => "cockpit.snapshot_requested",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalEvent {
    pub id: String,
    pub kind: EventKind,
    pub subject: String,
    pub message: String,
    pub at_ms: u128,
    pub attributes: Vec<(String, String)>,
}

#[derive(Debug, Default)]
pub struct EventStore {
    events: Vec<LocalEvent>,
    next_id: u64,
}

impl EventStore {
    pub fn new() -> Self {
        Self {
            events: Vec::new(),
            next_id: 1,
        }
    }

    pub fn append(
        &mut self,
        kind: EventKind,
        subject: impl Into<String>,
        message: impl Into<String>,
    ) -> LocalEvent {
        self.append_with_attributes(kind, subject, message, Vec::<(String, String)>::new())
    }

    pub fn append_with_attributes<I, K, V>(
        &mut self,
        kind: EventKind,
        subject: impl Into<String>,
        message: impl Into<String>,
        attributes: I,
    ) -> LocalEvent
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        let event = LocalEvent {
            id: format!("evt_{:06}", self.next_id),
            kind,
            subject: subject.into(),
            message: message.into(),
            at_ms: now_ms(),
            attributes: attributes
                .into_iter()
                .map(|(key, value)| (key.into(), value.into()))
                .collect(),
        };
        self.next_id += 1;
        self.events.push(event.clone());
        event
    }

    pub fn replay(&self) -> &[LocalEvent] {
        &self.events
    }

    pub fn by_kind(&self, kind: EventKind) -> Vec<&LocalEvent> {
        self.events
            .iter()
            .filter(|event| event.kind == kind)
            .collect()
    }

    pub fn last(&self) -> Option<&LocalEvent> {
        self.events.last()
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
