use fulcrum_events::LocalEvent;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    pub id: String,
    pub event: String,
    pub data: String,
}

pub fn stream_from_cursor(events: &[LocalEvent], last_seen_id: Option<&str>) -> Vec<SseEvent> {
    let start = last_seen_id
        .and_then(|id| events.iter().position(|event| event.id == id))
        .map(|position| position + 1)
        .unwrap_or(0);

    events[start..]
        .iter()
        .map(|event| SseEvent {
            id: event.id.clone(),
            event: event.kind.as_str().to_string(),
            data: format!("subject={} message={}", event.subject, event.message),
        })
        .collect()
}

pub fn encode_sse(event: &SseEvent) -> String {
    format!(
        "id: {}\nevent: {}\ndata: {}\n\n",
        event.id, event.event, event.data
    )
}
