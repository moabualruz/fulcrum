mod adapters;
mod ids;

pub use adapters::{
    AdapterBoundary, AdapterCapability, AdapterHealth, AdapterStatus, ExternalMapping,
    ProductAdapter, StubProductAdapter, default_product_adapters,
};
use fulcrum_events::{EventKind, EventStore, LocalEvent};
use fulcrum_graph::{GraphRef, OsGraph};
use ids::IdGenerator;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    InProgress,
    Blocked,
    Done,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub workspace_id: String,
    pub project_id: String,
    pub title: String,
    pub status: TaskStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunStatus {
    Running,
    Blocked,
    Completed,
    Canceled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentRun {
    pub id: String,
    pub task_id: String,
    pub agent_role: String,
    pub status: RunStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthReport {
    pub adapters: Vec<AdapterHealth>,
    pub event_count: usize,
    pub graph_edge_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperatorSnapshot {
    pub tasks_open: usize,
    pub tasks_running: usize,
    pub tasks_done: usize,
    pub active_runs: usize,
    pub health: Vec<AdapterHealth>,
    pub event_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplaySummary {
    pub workspaces: usize,
    pub projects: usize,
    pub tasks: usize,
    pub runs_started: usize,
    pub runs_completed: usize,
}

#[derive(Debug)]
pub struct Kernel {
    ids: IdGenerator,
    workspaces: Vec<Workspace>,
    projects: Vec<Project>,
    tasks: Vec<Task>,
    runs: Vec<AgentRun>,
    events: EventStore,
    graph: OsGraph,
    adapters: Vec<StubProductAdapter>,
    external_mappings: Vec<ExternalMapping>,
}

impl Default for Kernel {
    fn default() -> Self {
        Self::new()
    }
}

impl Kernel {
    pub fn new() -> Self {
        Self {
            ids: IdGenerator::default(),
            workspaces: Vec::new(),
            projects: Vec::new(),
            tasks: Vec::new(),
            runs: Vec::new(),
            events: EventStore::new(),
            graph: OsGraph::new(),
            adapters: default_product_adapters(),
            external_mappings: Vec::new(),
        }
    }

    pub fn create_workspace(&mut self, name: impl Into<String>) -> Workspace {
        let workspace = Workspace {
            id: self.ids.next("ws"),
            name: name.into(),
        };
        self.events.append_with_attributes(
            EventKind::WorkspaceCreated,
            workspace.id.clone(),
            "workspace created",
            [("name", workspace.name.as_str())],
        );
        self.workspaces.push(workspace.clone());
        workspace
    }

    pub fn create_project(
        &mut self,
        workspace_id: &str,
        name: impl Into<String>,
    ) -> Result<Project, String> {
        self.require_workspace(workspace_id)?;
        let project = Project {
            id: self.ids.next("proj"),
            workspace_id: workspace_id.to_string(),
            name: name.into(),
        };
        self.events.append_with_attributes(
            EventKind::ProjectCreated,
            project.id.clone(),
            "project created",
            [
                ("workspace_id", project.workspace_id.as_str()),
                ("name", project.name.as_str()),
            ],
        );
        self.graph.link(
            GraphRef::new("workspace", workspace_id),
            "contains",
            GraphRef::new("project", &project.id),
        );
        self.projects.push(project.clone());
        Ok(project)
    }

    pub fn create_task(
        &mut self,
        workspace_id: &str,
        project_id: &str,
        title: impl Into<String>,
    ) -> Result<Task, String> {
        self.require_project(workspace_id, project_id)?;
        let task = Task {
            id: self.ids.next("task"),
            workspace_id: workspace_id.to_string(),
            project_id: project_id.to_string(),
            title: title.into(),
            status: TaskStatus::Open,
        };
        self.events.append_with_attributes(
            EventKind::TaskCreated,
            task.id.clone(),
            "task created",
            [
                ("workspace_id", task.workspace_id.as_str()),
                ("project_id", task.project_id.as_str()),
                ("title", task.title.as_str()),
                ("status", "open"),
            ],
        );
        self.graph.link(
            GraphRef::new("project", project_id),
            "owns",
            GraphRef::new("task", &task.id),
        );
        self.tasks.push(task.clone());
        Ok(task)
    }

    pub fn start_run(
        &mut self,
        task_id: &str,
        agent_role: impl Into<String>,
    ) -> Result<AgentRun, String> {
        let task = self
            .tasks
            .iter_mut()
            .find(|task| task.id == task_id)
            .ok_or_else(|| format!("task not found: {task_id}"))?;
        task.status = TaskStatus::InProgress;
        let run = AgentRun {
            id: self.ids.next("run"),
            task_id: task_id.to_string(),
            agent_role: agent_role.into(),
            status: RunStatus::Running,
        };
        self.events.append_with_attributes(
            EventKind::RunStarted,
            run.id.clone(),
            "run started",
            [
                ("task_id", run.task_id.as_str()),
                ("agent_role", run.agent_role.as_str()),
                ("status", "running"),
            ],
        );
        self.graph.link(
            GraphRef::new("task", task_id),
            "started",
            GraphRef::new("run", &run.id),
        );
        self.runs.push(run.clone());
        Ok(run)
    }

    pub fn complete_run(&mut self, run_id: &str) -> Result<AgentRun, String> {
        let run = self
            .runs
            .iter_mut()
            .find(|run| run.id == run_id)
            .ok_or_else(|| format!("run not found: {run_id}"))?;
        run.status = RunStatus::Completed;
        if let Some(task) = self.tasks.iter_mut().find(|task| task.id == run.task_id) {
            task.status = TaskStatus::Done;
        }
        self.events.append_with_attributes(
            EventKind::RunCompleted,
            run.id.clone(),
            "run completed",
            [("task_id", run.task_id.as_str()), ("status", "completed")],
        );
        Ok(run.clone())
    }

    pub fn heartbeat_run(
        &mut self,
        run_id: &str,
        note: impl Into<String>,
    ) -> Result<AgentRun, String> {
        let run = self
            .runs
            .iter()
            .find(|run| run.id == run_id)
            .ok_or_else(|| format!("run not found: {run_id}"))?;
        self.events.append_with_attributes(
            EventKind::RunHeartbeat,
            run.id.clone(),
            note.into(),
            [("task_id", run.task_id.as_str()), ("status", "running")],
        );
        Ok(run.clone())
    }

    pub fn block_run(
        &mut self,
        run_id: &str,
        reason: impl Into<String>,
    ) -> Result<AgentRun, String> {
        let run = self
            .runs
            .iter_mut()
            .find(|run| run.id == run_id)
            .ok_or_else(|| format!("run not found: {run_id}"))?;
        run.status = RunStatus::Blocked;
        if let Some(task) = self.tasks.iter_mut().find(|task| task.id == run.task_id) {
            task.status = TaskStatus::Blocked;
        }
        self.events.append_with_attributes(
            EventKind::RunBlocked,
            run.id.clone(),
            reason.into(),
            [("task_id", run.task_id.as_str()), ("status", "blocked")],
        );
        Ok(run.clone())
    }

    pub fn cancel_run(
        &mut self,
        run_id: &str,
        reason: impl Into<String>,
    ) -> Result<AgentRun, String> {
        self.finish_run(
            run_id,
            RunStatus::Canceled,
            EventKind::RunCanceled,
            "canceled",
            reason,
        )
    }

    pub fn fail_run(
        &mut self,
        run_id: &str,
        reason: impl Into<String>,
    ) -> Result<AgentRun, String> {
        let run = self.finish_run(
            run_id,
            RunStatus::Failed,
            EventKind::RunFailed,
            "failed",
            reason,
        )?;
        if let Some(task) = self.tasks.iter_mut().find(|task| task.id == run.task_id) {
            task.status = TaskStatus::Failed;
        }
        Ok(run)
    }

    pub fn health_report(&self) -> HealthReport {
        HealthReport {
            adapters: self
                .adapters
                .iter()
                .map(|adapter| adapter.health())
                .collect(),
            event_count: self.events.len(),
            graph_edge_count: self.graph.edges().len(),
        }
    }

    pub fn check_adapter_health(&mut self) -> HealthReport {
        let adapters = self
            .adapters
            .iter()
            .map(|adapter| {
                let health = adapter.health();
                self.events.append_with_attributes(
                    EventKind::AdapterHealthChecked,
                    adapter.key(),
                    health.message.clone(),
                    [("status", health.status.as_str())],
                );
                health
            })
            .collect();
        HealthReport {
            adapters,
            event_count: self.events.len(),
            graph_edge_count: self.graph.edges().len(),
        }
    }

    pub fn operator_snapshot(&self) -> OperatorSnapshot {
        let health = self.health_report().adapters;
        OperatorSnapshot {
            tasks_open: self
                .tasks
                .iter()
                .filter(|task| matches!(task.status, TaskStatus::Open))
                .count(),
            tasks_running: self
                .tasks
                .iter()
                .filter(|task| matches!(task.status, TaskStatus::InProgress))
                .count(),
            tasks_done: self
                .tasks
                .iter()
                .filter(|task| matches!(task.status, TaskStatus::Done))
                .count(),
            active_runs: self
                .runs
                .iter()
                .filter(|run| matches!(run.status, RunStatus::Running))
                .count(),
            health,
            event_count: self.events.len(),
        }
    }

    pub fn record_cockpit_snapshot_requested(&mut self) {
        self.events.append(
            EventKind::CockpitSnapshotRequested,
            "cockpit",
            "cockpit snapshot requested",
        );
    }

    pub fn map_external_ref(
        &mut self,
        adapter_key: impl Into<String>,
        external_kind: impl Into<String>,
        external_id: impl Into<String>,
        fulcrum_ref: impl Into<String>,
    ) -> ExternalMapping {
        let mapping = ExternalMapping {
            adapter_key: adapter_key.into(),
            external_kind: external_kind.into(),
            external_id: external_id.into(),
            fulcrum_ref: fulcrum_ref.into(),
        };
        self.external_mappings.push(mapping.clone());
        mapping
    }

    pub fn external_mappings(&self) -> &[ExternalMapping] {
        &self.external_mappings
    }

    pub fn replay_summary(&self) -> ReplaySummary {
        ReplaySummary {
            workspaces: self.events.by_kind(EventKind::WorkspaceCreated).len(),
            projects: self.events.by_kind(EventKind::ProjectCreated).len(),
            tasks: self.events.by_kind(EventKind::TaskCreated).len(),
            runs_started: self.events.by_kind(EventKind::RunStarted).len(),
            runs_completed: self.events.by_kind(EventKind::RunCompleted).len(),
        }
    }

    pub fn events(&self) -> &[LocalEvent] {
        self.events.replay()
    }

    pub fn graph(&self) -> &OsGraph {
        &self.graph
    }

    pub fn tasks(&self) -> &[Task] {
        &self.tasks
    }

    pub fn runs(&self) -> &[AgentRun] {
        &self.runs
    }

    fn require_workspace(&self, workspace_id: &str) -> Result<(), String> {
        self.workspaces
            .iter()
            .any(|workspace| workspace.id == workspace_id)
            .then_some(())
            .ok_or_else(|| format!("workspace not found: {workspace_id}"))
    }

    fn require_project(&self, workspace_id: &str, project_id: &str) -> Result<(), String> {
        self.projects
            .iter()
            .any(|project| project.workspace_id == workspace_id && project.id == project_id)
            .then_some(())
            .ok_or_else(|| format!("project not found in workspace: {project_id}"))
    }

    fn finish_run(
        &mut self,
        run_id: &str,
        status: RunStatus,
        event_kind: EventKind,
        status_label: &'static str,
        reason: impl Into<String>,
    ) -> Result<AgentRun, String> {
        let run = self
            .runs
            .iter_mut()
            .find(|run| run.id == run_id)
            .ok_or_else(|| format!("run not found: {run_id}"))?;
        run.status = status;
        self.events.append_with_attributes(
            event_kind,
            run.id.clone(),
            reason.into(),
            [("task_id", run.task_id.as_str()), ("status", status_label)],
        );
        Ok(run.clone())
    }
}
