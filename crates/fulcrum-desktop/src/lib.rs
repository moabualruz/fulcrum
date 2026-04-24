use std::collections::HashMap;

use fulcrum_events::LocalEvent;
use fulcrum_kernel::{AdapterHealth, AdapterStatus, AgentRun, Kernel, RunStatus, Task, TaskStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CockpitSnapshot {
    pub tasks_open: usize,
    pub tasks_running: usize,
    pub tasks_done: usize,
    pub active_runs: usize,
    pub health: Vec<AdapterHealth>,
    pub event_count: usize,
    pub summary: DashboardSummary,
    pub task_board: TaskBoard,
    pub active_run_cards: Vec<ActiveRunCard>,
    pub blockers: Vec<BlockerCard>,
    pub artifacts: Vec<ArtifactCard>,
    pub review_queue: Vec<ReviewQueueItem>,
    pub merge_queue: Vec<MergeQueueItem>,
    pub policy_decisions: Vec<PolicyDecisionCard>,
    pub adapter_health: Vec<AdapterHealthCard>,
    pub events: Vec<LiveEventDto>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DashboardSummary {
    pub tasks_open: usize,
    pub tasks_running: usize,
    pub tasks_blocked: usize,
    pub tasks_done: usize,
    pub tasks_failed: usize,
    pub active_runs: usize,
    pub blockers: usize,
    pub artifacts: usize,
    pub reviews: usize,
    pub merges: usize,
    pub policies: usize,
    pub events: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskBoard {
    pub global: BoardColumns,
    pub projects: Vec<ProjectTaskBoard>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BoardColumns {
    pub open: Vec<TaskCard>,
    pub running: Vec<TaskCard>,
    pub blocked: Vec<TaskCard>,
    pub done: Vec<TaskCard>,
    pub failed: Vec<TaskCard>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectTaskBoard {
    pub project_id: String,
    pub project_name: String,
    pub columns: BoardColumns,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskCard {
    pub id: String,
    pub workspace_id: String,
    pub project_id: String,
    pub project_name: String,
    pub title: String,
    pub status: String,
    pub run_id: Option<String>,
    pub blockers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveRunCard {
    pub id: String,
    pub task_id: String,
    pub project_id: Option<String>,
    pub task_title: Option<String>,
    pub agent_role: String,
    pub status: String,
    pub last_event_id: Option<String>,
    pub note: Option<String>,
    pub blocking_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockerCard {
    pub id: String,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub severity: String,
    pub title: String,
    pub detail: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactCard {
    pub id: String,
    pub run_id: String,
    pub task_id: Option<String>,
    pub kind: String,
    pub path: String,
    pub label: Option<String>,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewQueueItem {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub status: String,
    pub reviewer: Option<String>,
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeQueueItem {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub status: String,
    pub target: Option<String>,
    pub reason: Option<String>,
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecisionCard {
    pub id: String,
    pub subject_kind: String,
    pub subject_id: String,
    pub allowed: bool,
    pub reason: String,
    pub at_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterHealthCard {
    pub key: String,
    pub status: String,
    pub message: String,
    pub degraded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveEventDto {
    pub id: String,
    pub kind: String,
    pub subject: String,
    pub message: String,
    pub at_ms: u128,
    pub attributes: Vec<(String, String)>,
}

pub fn build_snapshot(kernel: &Kernel) -> CockpitSnapshot {
    let operator = kernel.operator_snapshot();
    let project_names = project_names(kernel.events());
    let latest_run_by_task = latest_run_by_task(kernel.runs());
    let mut task_board = TaskBoard {
        global: BoardColumns::default(),
        projects: Vec::new(),
    };

    for task in kernel.tasks() {
        let card = task_card(task, &project_names, latest_run_by_task.get(&task.id));
        push_task_card(&mut task_board.global, card.clone());
        push_project_task_card(&mut task_board.projects, card);
    }

    let task_by_id: HashMap<&str, &Task> = kernel
        .tasks()
        .iter()
        .map(|task| (task.id.as_str(), task))
        .collect();
    let active_run_cards = kernel
        .runs()
        .iter()
        .filter(|run| matches!(run.status, RunStatus::Running | RunStatus::Blocked))
        .map(|run| active_run_card(run, &task_by_id, kernel.events()))
        .collect::<Vec<_>>();
    let blockers = active_run_cards
        .iter()
        .filter(|run| run.status == "blocked")
        .map(|run| BlockerCard {
            id: format!("blocker:{}", run.id),
            task_id: Some(run.task_id.clone()),
            run_id: Some(run.id.clone()),
            severity: "critical".to_string(),
            title: "Run blocked".to_string(),
            detail: run
                .blocking_reason
                .clone()
                .unwrap_or_else(|| "run blocked".to_string()),
            status: "open".to_string(),
        })
        .collect::<Vec<_>>();
    let events = kernel
        .events()
        .iter()
        .map(live_event_dto)
        .collect::<Vec<_>>();
    let adapter_health = operator
        .health
        .iter()
        .map(adapter_health_card)
        .collect::<Vec<_>>();

    let mut snapshot = CockpitSnapshot {
        tasks_open: operator.tasks_open,
        tasks_running: operator.tasks_running,
        tasks_done: operator.tasks_done,
        active_runs: operator.active_runs,
        health: operator.health,
        event_count: operator.event_count,
        summary: DashboardSummary {
            tasks_open: task_board.global.open.len(),
            tasks_running: task_board.global.running.len(),
            tasks_blocked: task_board.global.blocked.len(),
            tasks_done: task_board.global.done.len(),
            tasks_failed: task_board.global.failed.len(),
            active_runs: active_run_cards
                .iter()
                .filter(|run| run.status == "running")
                .count(),
            blockers: blockers
                .iter()
                .filter(|blocker| blocker.status == "open")
                .count(),
            artifacts: 0,
            reviews: 0,
            merges: 0,
            policies: 0,
            events: events.len(),
        },
        task_board,
        active_run_cards,
        blockers,
        artifacts: Vec::new(),
        review_queue: Vec::new(),
        merge_queue: Vec::new(),
        policy_decisions: Vec::new(),
        adapter_health,
        events,
    };
    refresh_summary(&mut snapshot);
    snapshot
}

pub fn append_live_event(snapshot: &mut CockpitSnapshot, event: LiveEventDto) {
    if !snapshot.events.iter().any(|seen| seen.id == event.id) {
        snapshot.events.push(event.clone());
    }
    apply_live_event(snapshot, &event);
    snapshot.event_count = snapshot.events.len();
    refresh_summary(snapshot);
}

pub fn render_dashboard(snapshot: &CockpitSnapshot) -> String {
    [
        render_summary(snapshot),
        render_task_board(snapshot),
        render_active_runs(snapshot),
        render_blockers(snapshot),
        render_artifacts(snapshot),
        render_queues(snapshot),
        render_policy_decisions(snapshot),
        render_adapter_health(snapshot),
        render_event_stream(snapshot),
    ]
    .join("\n")
}

pub fn render_summary(snapshot: &CockpitSnapshot) -> String {
    format!(
        "open={} running={} blocked={} done={} failed={} activeRuns={} blockers={} artifacts={} reviews={} merges={} policies={} health={} events={}",
        snapshot.summary.tasks_open,
        snapshot.summary.tasks_running,
        snapshot.summary.tasks_blocked,
        snapshot.summary.tasks_done,
        snapshot.summary.tasks_failed,
        snapshot.summary.active_runs,
        snapshot.summary.blockers,
        snapshot.summary.artifacts,
        snapshot.summary.reviews,
        snapshot.summary.merges,
        snapshot.summary.policies,
        snapshot.adapter_health.len(),
        snapshot.summary.events
    )
}

pub fn render_task_board(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["task board".to_string()];
    lines.push(format!(
        "global open={} running={} blocked={} done={} failed={}",
        snapshot.task_board.global.open.len(),
        snapshot.task_board.global.running.len(),
        snapshot.task_board.global.blocked.len(),
        snapshot.task_board.global.done.len(),
        snapshot.task_board.global.failed.len()
    ));
    lines.extend(snapshot.task_board.projects.iter().map(|project| {
        format!(
            "{} open={} running={} blocked={} done={} failed={}",
            project.project_name,
            project.columns.open.len(),
            project.columns.running.len(),
            project.columns.blocked.len(),
            project.columns.done.len(),
            project.columns.failed.len()
        )
    }));
    lines.join("\n")
}

pub fn render_active_runs(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec![format!("active runs: {}", snapshot.summary.active_runs)];
    lines.extend(snapshot.active_run_cards.iter().map(|run| {
        format!(
            "run:{}:{}:{}:{}",
            run.id,
            run.status,
            run.task_title.as_deref().unwrap_or(&run.task_id),
            run.agent_role
        )
    }));
    lines.join("\n")
}

pub fn render_blockers(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["blockers".to_string()];
    if snapshot.blockers.is_empty() {
        lines.push("blocker:none".to_string());
    } else {
        lines.extend(snapshot.blockers.iter().map(|blocker| {
            format!(
                "blocker:{}:{}:{}:{}",
                blocker.id, blocker.severity, blocker.status, blocker.detail
            )
        }));
    }
    lines.join("\n")
}

pub fn render_artifacts(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["artifacts".to_string()];
    if snapshot.artifacts.is_empty() {
        lines.push("artifact:none".to_string());
    } else {
        lines.extend(snapshot.artifacts.iter().map(|artifact| {
            format!(
                "artifact:{}:{}:{}:{}",
                artifact.id, artifact.state, artifact.kind, artifact.path
            )
        }));
    }
    lines.join("\n")
}

pub fn render_queues(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["queues".to_string()];
    if snapshot.review_queue.is_empty() && snapshot.merge_queue.is_empty() {
        lines.push("queue:none".to_string());
    } else {
        lines.extend(
            snapshot
                .review_queue
                .iter()
                .map(|item| format!("review:{}:{}:{}", item.id, item.status, item.title)),
        );
        lines.extend(
            snapshot
                .merge_queue
                .iter()
                .map(|item| format!("merge:{}:{}:{}", item.id, item.status, item.title)),
        );
    }
    lines.join("\n")
}

pub fn render_policy_decisions(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["policy decisions".to_string()];
    if snapshot.policy_decisions.is_empty() {
        lines.push("policy:none".to_string());
    } else {
        lines.extend(snapshot.policy_decisions.iter().map(|decision| {
            let outcome = if decision.allowed {
                "allowed"
            } else {
                "denied"
            };
            format!(
                "policy:{}:{}:{}:{}:{}",
                decision.id, outcome, decision.subject_kind, decision.subject_id, decision.reason
            )
        }));
    }
    lines.join("\n")
}

pub fn render_adapter_health(snapshot: &CockpitSnapshot) -> String {
    let degraded = snapshot.adapter_health.iter().any(|item| item.degraded);
    let mut lines = vec![if degraded {
        "health:degraded".to_string()
    } else {
        "health:available".to_string()
    }];
    lines.extend(
        snapshot
            .adapter_health
            .iter()
            .map(|item| format!("{}:{} {}", item.key, item.status, item.message)),
    );
    lines.join("\n")
}

pub fn render_event_stream(snapshot: &CockpitSnapshot) -> String {
    let mut lines = vec!["event stream".to_string()];
    if snapshot.events.is_empty() {
        lines.push("event:none".to_string());
    } else {
        lines.extend(snapshot.events.iter().map(|event| {
            format!(
                "event:{}:{}:{}:{}",
                event.id, event.kind, event.subject, event.message
            )
        }));
    }
    lines.join("\n")
}

fn apply_live_event(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    match event.kind.as_str() {
        "run.heartbeat" => update_run_note(snapshot, event),
        "run.blocked" => {
            update_run_status(snapshot, event, "blocked");
            upsert_blocker(snapshot, event);
        }
        "run.completed" => {
            update_task_status(snapshot, attr(event, "task_id"), "done");
            snapshot
                .active_run_cards
                .retain(|run| run.id != event.subject);
        }
        "run.failed" => {
            update_task_status(snapshot, attr(event, "task_id"), "failed");
            snapshot
                .active_run_cards
                .retain(|run| run.id != event.subject);
        }
        "artifact.created" => upsert_artifact(snapshot, event),
        "review.requested"
        | "review.in_review"
        | "review.approved"
        | "review.changes_requested" => upsert_review(snapshot, event),
        "merge.ready" | "merge.blocked" | "merge.merged" | "merge.failed" => {
            upsert_merge(snapshot, event)
        }
        "policy.decision" => upsert_policy_decision(snapshot, event),
        "adapter.health_checked" => upsert_adapter_health(snapshot, event),
        _ => {}
    }
}

fn update_run_note(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    if let Some(run) = snapshot
        .active_run_cards
        .iter_mut()
        .find(|run| run.id == event.subject)
    {
        run.last_event_id = Some(event.id.clone());
        run.note = Some(event.message.clone());
    }
}

fn update_run_status(snapshot: &mut CockpitSnapshot, event: &LiveEventDto, status: &str) {
    let blocked_task_id = if let Some(run) = snapshot
        .active_run_cards
        .iter_mut()
        .find(|run| run.id == event.subject)
    {
        run.status = status.to_string();
        run.last_event_id = Some(event.id.clone());
        run.note = Some(event.message.clone());
        if status == "blocked" {
            run.blocking_reason = Some(event.message.clone());
            Some(run.task_id.clone())
        } else {
            None
        }
    } else {
        None
    };
    if let Some(task_id) = blocked_task_id {
        update_task_status(snapshot, Some(task_id.as_str()), "blocked");
    }
}

fn update_task_status(snapshot: &mut CockpitSnapshot, task_id: Option<&str>, status: &str) {
    let Some(task_id) = task_id else {
        return;
    };
    let Some(mut card) = remove_task_card(&mut snapshot.task_board.global, task_id) else {
        return;
    };
    card.status = status.to_string();
    push_task_card(&mut snapshot.task_board.global, card.clone());
    if let Some(project) = snapshot
        .task_board
        .projects
        .iter_mut()
        .find(|project| project.project_id == card.project_id)
    {
        remove_task_card(&mut project.columns, task_id);
        push_task_card(&mut project.columns, card);
    }
}

fn upsert_blocker(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let blocker = BlockerCard {
        id: attr(event, "blocker_id")
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("blocker:{}", event.subject)),
        task_id: attr(event, "task_id").map(ToString::to_string),
        run_id: Some(event.subject.clone()),
        severity: attr(event, "severity").unwrap_or("critical").to_string(),
        title: attr(event, "title").unwrap_or("Run blocked").to_string(),
        detail: event.message.clone(),
        status: "open".to_string(),
    };
    upsert_by_id(&mut snapshot.blockers, blocker, |item| &item.id);
}

fn upsert_artifact(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let artifact = ArtifactCard {
        id: event.subject.clone(),
        run_id: attr(event, "run_id").unwrap_or(&event.subject).to_string(),
        task_id: attr(event, "task_id").map(ToString::to_string),
        kind: attr(event, "kind").unwrap_or("result").to_string(),
        path: attr(event, "path").unwrap_or(&event.message).to_string(),
        label: attr(event, "label").map(ToString::to_string),
        state: attr(event, "state").unwrap_or("ready").to_string(),
    };
    upsert_by_id(&mut snapshot.artifacts, artifact, |item| &item.id);
}

fn upsert_review(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let review = ReviewQueueItem {
        id: event.subject.clone(),
        task_id: attr(event, "task_id").unwrap_or(&event.subject).to_string(),
        title: attr(event, "title").unwrap_or(&event.message).to_string(),
        status: attr(event, "status")
            .map(ToString::to_string)
            .unwrap_or_else(|| event.kind.trim_start_matches("review.").to_string()),
        reviewer: attr(event, "reviewer").map(ToString::to_string),
        run_id: attr(event, "run_id").map(ToString::to_string),
    };
    upsert_by_id(&mut snapshot.review_queue, review, |item| &item.id);
}

fn upsert_merge(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let merge = MergeQueueItem {
        id: event.subject.clone(),
        task_id: attr(event, "task_id").unwrap_or(&event.subject).to_string(),
        title: attr(event, "title").unwrap_or(&event.message).to_string(),
        status: attr(event, "status")
            .map(ToString::to_string)
            .unwrap_or_else(|| event.kind.trim_start_matches("merge.").to_string()),
        target: attr(event, "target").map(ToString::to_string),
        reason: attr(event, "reason")
            .map(ToString::to_string)
            .or_else(|| Some(event.message.clone())),
        run_id: attr(event, "run_id").map(ToString::to_string),
    };
    upsert_by_id(&mut snapshot.merge_queue, merge, |item| &item.id);
}

fn upsert_policy_decision(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let decision = PolicyDecisionCard {
        id: event.subject.clone(),
        subject_kind: attr(event, "subject_kind").unwrap_or("run").to_string(),
        subject_id: attr(event, "subject_id")
            .unwrap_or(&event.subject)
            .to_string(),
        allowed: attr(event, "allowed") == Some("true"),
        reason: attr(event, "reason").unwrap_or(&event.message).to_string(),
        at_ms: event.at_ms,
    };
    upsert_by_id(&mut snapshot.policy_decisions, decision, |item| &item.id);
}

fn upsert_adapter_health(snapshot: &mut CockpitSnapshot, event: &LiveEventDto) {
    let status = attr(event, "status").unwrap_or("missing").to_string();
    let item = AdapterHealthCard {
        key: event.subject.clone(),
        degraded: status != "available",
        status,
        message: event.message.clone(),
    };
    upsert_by_id(&mut snapshot.adapter_health, item, |item| &item.key);
}

fn upsert_by_id<T, F>(items: &mut Vec<T>, item: T, id: F)
where
    F: Fn(&T) -> &String,
{
    if let Some(index) = items.iter().position(|existing| id(existing) == id(&item)) {
        items[index] = item;
    } else {
        items.push(item);
    }
}

fn refresh_summary(snapshot: &mut CockpitSnapshot) {
    snapshot.summary = DashboardSummary {
        tasks_open: snapshot.task_board.global.open.len(),
        tasks_running: snapshot.task_board.global.running.len(),
        tasks_blocked: snapshot.task_board.global.blocked.len(),
        tasks_done: snapshot.task_board.global.done.len(),
        tasks_failed: snapshot.task_board.global.failed.len(),
        active_runs: snapshot
            .active_run_cards
            .iter()
            .filter(|run| run.status == "running")
            .count(),
        blockers: snapshot
            .blockers
            .iter()
            .filter(|blocker| blocker.status == "open")
            .count(),
        artifacts: snapshot.artifacts.len(),
        reviews: snapshot
            .review_queue
            .iter()
            .filter(|item| item.status != "approved")
            .count(),
        merges: snapshot
            .merge_queue
            .iter()
            .filter(|item| item.status != "merged")
            .count(),
        policies: snapshot.policy_decisions.len(),
        events: snapshot.events.len(),
    };
}

fn task_card(
    task: &Task,
    project_names: &HashMap<String, String>,
    run: Option<&&AgentRun>,
) -> TaskCard {
    TaskCard {
        id: task.id.clone(),
        workspace_id: task.workspace_id.clone(),
        project_id: task.project_id.clone(),
        project_name: project_names
            .get(&task.project_id)
            .cloned()
            .unwrap_or_else(|| task.project_id.clone()),
        title: task.title.clone(),
        status: task_status_label(&task.status).to_string(),
        run_id: run.map(|run| run.id.clone()),
        blockers: Vec::new(),
    }
}

fn active_run_card(
    run: &AgentRun,
    task_by_id: &HashMap<&str, &Task>,
    events: &[LocalEvent],
) -> ActiveRunCard {
    let blocked_event = events
        .iter()
        .rev()
        .find(|event| event.kind.as_str() == "run.blocked" && event.subject == run.id);
    let last_event = events.iter().rev().find(|event| event.subject == run.id);
    let task = task_by_id.get(run.task_id.as_str()).copied();
    ActiveRunCard {
        id: run.id.clone(),
        task_id: run.task_id.clone(),
        project_id: task.map(|task| task.project_id.clone()),
        task_title: task.map(|task| task.title.clone()),
        agent_role: run.agent_role.clone(),
        status: run_status_label(&run.status).to_string(),
        last_event_id: last_event.map(|event| event.id.clone()),
        note: last_event.map(|event| event.message.clone()),
        blocking_reason: blocked_event.map(|event| event.message.clone()),
    }
}

fn project_names(events: &[LocalEvent]) -> HashMap<String, String> {
    events
        .iter()
        .filter(|event| event.kind.as_str() == "project.created")
        .filter_map(|event| attr_event(event, "name").map(|name| (event.subject.clone(), name)))
        .collect()
}

fn latest_run_by_task(runs: &[AgentRun]) -> HashMap<String, &AgentRun> {
    let mut by_task = HashMap::new();
    for run in runs {
        by_task.insert(run.task_id.clone(), run);
    }
    by_task
}

fn push_project_task_card(projects: &mut Vec<ProjectTaskBoard>, card: TaskCard) {
    let index = projects
        .iter()
        .position(|project| project.project_id == card.project_id);
    let project = if let Some(index) = index {
        &mut projects[index]
    } else {
        projects.push(ProjectTaskBoard {
            project_id: card.project_id.clone(),
            project_name: card.project_name.clone(),
            columns: BoardColumns::default(),
        });
        projects.last_mut().expect("project just pushed")
    };
    push_task_card(&mut project.columns, card);
}

fn push_task_card(columns: &mut BoardColumns, card: TaskCard) {
    match card.status.as_str() {
        "open" => columns.open.push(card),
        "running" => columns.running.push(card),
        "blocked" => columns.blocked.push(card),
        "done" => columns.done.push(card),
        "failed" => columns.failed.push(card),
        _ => columns.open.push(card),
    }
}

fn remove_task_card(columns: &mut BoardColumns, task_id: &str) -> Option<TaskCard> {
    if let Some(index) = columns.open.iter().position(|task| task.id == task_id) {
        return Some(columns.open.remove(index));
    }
    if let Some(index) = columns.running.iter().position(|task| task.id == task_id) {
        return Some(columns.running.remove(index));
    }
    if let Some(index) = columns.blocked.iter().position(|task| task.id == task_id) {
        return Some(columns.blocked.remove(index));
    }
    if let Some(index) = columns.done.iter().position(|task| task.id == task_id) {
        return Some(columns.done.remove(index));
    }
    if let Some(index) = columns.failed.iter().position(|task| task.id == task_id) {
        return Some(columns.failed.remove(index));
    }
    None
}

fn live_event_dto(event: &LocalEvent) -> LiveEventDto {
    LiveEventDto {
        id: event.id.clone(),
        kind: event.kind.as_str().to_string(),
        subject: event.subject.clone(),
        message: event.message.clone(),
        at_ms: event.at_ms,
        attributes: event.attributes.clone(),
    }
}

fn adapter_health_card(health: &AdapterHealth) -> AdapterHealthCard {
    let status = health.status.as_str().to_string();
    AdapterHealthCard {
        key: health.key.clone(),
        degraded: health.status != AdapterStatus::Available,
        status,
        message: health.message.clone(),
    }
}

fn task_status_label(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Open => "open",
        TaskStatus::InProgress => "running",
        TaskStatus::Blocked => "blocked",
        TaskStatus::Done => "done",
        TaskStatus::Failed => "failed",
    }
}

fn run_status_label(status: &RunStatus) -> &'static str {
    match status {
        RunStatus::Running => "running",
        RunStatus::Blocked => "blocked",
        RunStatus::Completed => "completed",
        RunStatus::Canceled => "canceled",
        RunStatus::Failed => "failed",
    }
}

fn attr<'a>(event: &'a LiveEventDto, key: &str) -> Option<&'a str> {
    event
        .attributes
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.as_str())
}

fn attr_event(event: &LocalEvent, key: &str) -> Option<String> {
    event
        .attributes
        .iter()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.clone())
}
