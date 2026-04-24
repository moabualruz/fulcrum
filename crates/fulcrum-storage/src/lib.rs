use fulcrum_config::FulcrumPaths;
use fulcrum_policy::evaluate_run_transition;
use rusqlite::{Connection, params};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceRow {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectRow {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunRow {
    pub id: String,
    pub task_id: String,
    pub runner: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRow {
    pub id: String,
    pub kind: String,
    pub subject: String,
    pub message: String,
    pub attributes: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusSummary {
    pub workspaces: usize,
    pub projects: usize,
    pub tasks: usize,
    pub runs: usize,
    pub events: usize,
}

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn open(paths: &FulcrumPaths) -> Result<Self, String> {
        let conn = Connection::open(&paths.db)
            .map_err(|err| format!("failed to open {}: {err}", paths.db.display()))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|err| format!("failed to enable foreign keys: {err}"))?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|err| format!("failed to enable WAL: {err}"))?;
        let storage = Self { conn };
        storage.run_migrations()?;
        Ok(storage)
    }

    pub fn run_migrations(&self) -> Result<(), String> {
        self.conn
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  version INTEGER PRIMARY KEY,
                  applied_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS id_counters (
                  prefix TEXT PRIMARY KEY,
                  next_value INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS workspaces (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projects (
                  id TEXT PRIMARY KEY,
                  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                  path TEXT NOT NULL,
                  name TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tasks (
                  id TEXT PRIMARY KEY,
                  project_id TEXT NOT NULL REFERENCES projects(id),
                  title TEXT NOT NULL,
                  status TEXT NOT NULL CHECK (status IN ('open','in_progress','blocked','done','failed'))
                );
                CREATE TABLE IF NOT EXISTS runs (
                  id TEXT PRIMARY KEY,
                  task_id TEXT NOT NULL REFERENCES tasks(id),
                  runner TEXT NOT NULL,
                  status TEXT NOT NULL CHECK (status IN ('queued','running','blocked','completed','failed','canceled'))
                );
                CREATE TABLE IF NOT EXISTS run_heartbeats (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL REFERENCES runs(id),
                  note TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS artifacts (
                  id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL REFERENCES runs(id),
                  path TEXT NOT NULL,
                  kind TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                  id TEXT PRIMARY KEY,
                  kind TEXT NOT NULL,
                  subject TEXT NOT NULL,
                  message TEXT NOT NULL,
                  attributes TEXT NOT NULL DEFAULT '',
                  created_at TEXT NOT NULL
                );
                INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
                ",
            )
            .map_err(|err| format!("failed to run migrations: {err}"))?;
        self.ensure_column("events", "attributes", "TEXT NOT NULL DEFAULT ''")?;
        Ok(())
    }

    pub fn ensure_default_workspace(&self) -> Result<WorkspaceRow, String> {
        if let Some(workspace) = self.default_workspace()? {
            return Ok(workspace);
        }
        let workspace = WorkspaceRow {
            id: self.next_id("ws")?,
            name: "default".to_string(),
        };
        self.conn
            .execute(
                "INSERT INTO workspaces(id, name) VALUES (?1, ?2)",
                params![workspace.id, workspace.name],
            )
            .map_err(|err| format!("failed to create workspace: {err}"))?;
        self.append_event_with_attributes(
            "workspace.created",
            &workspace.id,
            "default workspace created",
            [("name", workspace.name.clone())],
        )?;
        Ok(workspace)
    }

    pub fn default_workspace(&self) -> Result<Option<WorkspaceRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name FROM workspaces ORDER BY id LIMIT 1")
            .map_err(|err| format!("failed to prepare workspace query: {err}"))?;
        let mut rows = stmt
            .query([])
            .map_err(|err| format!("failed to query workspaces: {err}"))?;
        if let Some(row) = rows
            .next()
            .map_err(|err| format!("failed to read workspace: {err}"))?
        {
            Ok(Some(WorkspaceRow {
                id: row.get(0).map_err(sql_err)?,
                name: row.get(1).map_err(sql_err)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn add_project(&self, path: &str, name: &str) -> Result<ProjectRow, String> {
        let workspace = self.ensure_default_workspace()?;
        let project = ProjectRow {
            id: self.next_id("proj")?,
            workspace_id: workspace.id,
            path: path.to_string(),
            name: name.to_string(),
        };
        self.conn
            .execute(
                "INSERT INTO projects(id, workspace_id, path, name) VALUES (?1, ?2, ?3, ?4)",
                params![project.id, project.workspace_id, project.path, project.name],
            )
            .map_err(|err| format!("failed to add project: {err}"))?;
        self.append_event_with_attributes(
            "project.added",
            &project.id,
            "project added",
            [
                ("workspace_id", project.workspace_id.clone()),
                ("path", project.path.clone()),
                ("name", project.name.clone()),
            ],
        )?;
        Ok(project)
    }

    pub fn default_project(&self) -> Result<Option<ProjectRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, workspace_id, path, name FROM projects ORDER BY id LIMIT 1")
            .map_err(|err| format!("failed to prepare project query: {err}"))?;
        let mut rows = stmt
            .query([])
            .map_err(|err| format!("failed to query projects: {err}"))?;
        if let Some(row) = rows.next().map_err(sql_err)? {
            Ok(Some(ProjectRow {
                id: row.get(0).map_err(sql_err)?,
                workspace_id: row.get(1).map_err(sql_err)?,
                path: row.get(2).map_err(sql_err)?,
                name: row.get(3).map_err(sql_err)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn create_task(&self, title: &str) -> Result<TaskRow, String> {
        let project = self
            .default_project()?
            .ok_or_else(|| "no project registered; run `fulcrum project add <path>`".to_string())?;
        let task = TaskRow {
            id: self.next_id("task")?,
            project_id: project.id,
            title: title.to_string(),
            status: "open".to_string(),
        };
        self.conn
            .execute(
                "INSERT INTO tasks(id, project_id, title, status) VALUES (?1, ?2, ?3, ?4)",
                params![task.id, task.project_id, task.title, task.status],
            )
            .map_err(|err| format!("failed to create task: {err}"))?;
        self.append_event_with_attributes(
            "task.created",
            &task.id,
            &task.title,
            [
                ("project_id", task.project_id.clone()),
                ("title", task.title.clone()),
                ("status", task.status.clone()),
            ],
        )?;
        Ok(task)
    }

    pub fn start_run(&self, task_id: &str, runner: &str) -> Result<RunRow, String> {
        let changed = self
            .conn
            .execute(
                "UPDATE tasks SET status = 'in_progress' WHERE id = ?1",
                params![task_id],
            )
            .map_err(|err| format!("failed to update task: {err}"))?;
        if changed == 0 {
            return Err(format!("task not found: {task_id}"));
        }
        let run = RunRow {
            id: self.next_id("run")?,
            task_id: task_id.to_string(),
            runner: runner.to_string(),
            status: "running".to_string(),
        };
        self.conn
            .execute(
                "INSERT INTO runs(id, task_id, runner, status) VALUES (?1, ?2, ?3, ?4)",
                params![run.id, run.task_id, run.runner, run.status],
            )
            .map_err(|err| format!("failed to start run: {err}"))?;
        self.append_event_with_attributes(
            "run.started",
            &run.id,
            task_id,
            [
                ("task_id", task_id.to_string()),
                ("agent_role", runner.to_string()),
                ("status", run.status.clone()),
            ],
        )?;
        Ok(run)
    }

    pub fn complete_run(&self, run_id: &str) -> Result<(), String> {
        self.enforce_run_transition(run_id, "completed")?;
        let changed = self
            .conn
            .execute(
                "UPDATE runs SET status = 'completed' WHERE id = ?1",
                params![run_id],
            )
            .map_err(|err| format!("failed to complete run: {err}"))?;
        if changed == 0 {
            return Err(format!("run not found: {run_id}"));
        }
        self.conn
            .execute(
                "UPDATE tasks SET status = 'done' WHERE id = (SELECT task_id FROM runs WHERE id = ?1)",
                params![run_id],
            )
            .map_err(|err| format!("failed to complete task: {err}"))?;
        self.append_event_with_attributes(
            "run.completed",
            run_id,
            "run completed",
            [("status", "completed".to_string())],
        )?;
        Ok(())
    }

    pub fn block_run(&self, run_id: &str, reason: &str) -> Result<(), String> {
        self.enforce_run_transition(run_id, "blocked")?;
        let changed = self
            .conn
            .execute(
                "UPDATE runs SET status = 'blocked' WHERE id = ?1",
                params![run_id],
            )
            .map_err(|err| format!("failed to block run: {err}"))?;
        if changed == 0 {
            return Err(format!("run not found: {run_id}"));
        }
        self.append_event_with_attributes(
            "run.blocked",
            run_id,
            reason,
            [("status", "blocked".to_string())],
        )?;
        Ok(())
    }

    pub fn heartbeat_run(&self, run_id: &str, note: &str) -> Result<(), String> {
        let status = self.run_status(run_id)?;
        if status != "running" && status != "blocked" {
            return Err(format!("cannot heartbeat {status} run: {run_id}"));
        }
        let id = self.next_id("hb")?;
        self.conn
            .execute(
                "INSERT INTO run_heartbeats(id, run_id, note, created_at) VALUES (?1, ?2, ?3, datetime('now'))",
                params![id, run_id, note],
            )
            .map_err(|err| format!("failed to write heartbeat: {err}"))?;
        self.append_event_with_attributes("run.heartbeat", run_id, note, [("status", status)])?;
        Ok(())
    }

    pub fn cancel_run(&self, run_id: &str, reason: &str) -> Result<(), String> {
        self.set_run_terminal_status(run_id, "canceled", "run.canceled", reason)
    }

    pub fn fail_run(&self, run_id: &str, reason: &str) -> Result<(), String> {
        self.set_run_terminal_status(run_id, "failed", "run.failed", reason)
    }

    pub fn task_done(&self, task_id: &str) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE tasks SET status = 'done' WHERE id = ?1",
                params![task_id],
            )
            .map_err(|err| format!("failed to mark task done: {err}"))?;
        if changed == 0 {
            return Err(format!("task not found: {task_id}"));
        }
        self.append_event_with_attributes(
            "task.done",
            task_id,
            "task marked done",
            [("status", "done".to_string())],
        )?;
        Ok(())
    }

    pub fn add_artifact(&self, run_id: &str, path: &str, kind: &str) -> Result<String, String> {
        let id = self.next_id("art")?;
        self.conn
            .execute(
                "INSERT INTO artifacts(id, run_id, path, kind) VALUES (?1, ?2, ?3, ?4)",
                params![id, run_id, path, kind],
            )
            .map_err(|err| format!("failed to add artifact: {err}"))?;
        self.append_event_with_attributes(
            "artifact.created",
            &id,
            path,
            [
                ("run_id", run_id.to_string()),
                ("path", path.to_string()),
                ("kind", kind.to_string()),
                ("state", "ready".to_string()),
            ],
        )?;
        Ok(id)
    }

    pub fn list_artifacts(&self, run_id: &str) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT path FROM artifacts WHERE run_id = ?1 ORDER BY id")
            .map_err(|err| format!("failed to prepare artifact query: {err}"))?;
        let rows = stmt
            .query_map(params![run_id], |row| row.get::<_, String>(0))
            .map_err(|err| format!("failed to query artifacts: {err}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql_err)
    }

    pub fn events(&self) -> Result<Vec<EventRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, kind, subject, message, attributes FROM events ORDER BY id")
            .map_err(|err| format!("failed to prepare events query: {err}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(EventRow {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    subject: row.get(2)?,
                    message: row.get(3)?,
                    attributes: decode_attributes(&row.get::<_, String>(4)?),
                })
            })
            .map_err(|err| format!("failed to query events: {err}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql_err)
    }

    pub fn events_for_subject(&self, subject: &str) -> Result<Vec<EventRow>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, kind, subject, message, attributes FROM events WHERE subject = ?1 ORDER BY id")
            .map_err(|err| format!("failed to prepare events query: {err}"))?;
        let rows = stmt
            .query_map(params![subject], |row| {
                Ok(EventRow {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    subject: row.get(2)?,
                    message: row.get(3)?,
                    attributes: decode_attributes(&row.get::<_, String>(4)?),
                })
            })
            .map_err(|err| format!("failed to query events: {err}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(sql_err)
    }

    pub fn summary(&self) -> Result<StatusSummary, String> {
        Ok(StatusSummary {
            workspaces: self.count("workspaces")?,
            projects: self.count("projects")?,
            tasks: self.count("tasks")?,
            runs: self.count("runs")?,
            events: self.count("events")?,
        })
    }

    pub fn backup(&self, paths: &FulcrumPaths) -> Result<PathBuf, String> {
        fs::create_dir_all(&paths.backups)
            .map_err(|err| format!("failed to create backups dir: {err}"))?;
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|err| format!("failed to checkpoint WAL before backup: {err}"))?;
        let backup_path = paths.backups.join(format!("fulcrum-{}.db", now_ms()));
        fs::copy(&paths.db, &backup_path).map_err(|err| {
            format!(
                "failed to copy {} to {}: {err}",
                paths.db.display(),
                backup_path.display()
            )
        })?;
        let size = fs::metadata(&backup_path)
            .map_err(|err| format!("failed to stat backup {}: {err}", backup_path.display()))?
            .len();
        fs::write(
            backup_path.with_extension("db.manifest"),
            format!("schema_version = 1\nbytes = {size}\n"),
        )
        .map_err(|err| format!("failed to write backup manifest: {err}"))?;
        Ok(backup_path)
    }

    pub fn verify_backup(path: &str) -> Result<(), String> {
        let conn =
            Connection::open(path).map_err(|err| format!("failed to open backup {path}: {err}"))?;
        conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |_| Ok(()))
            .map_err(|err| format!("backup missing schema_migrations: {err}"))?;
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|err| format!("backup integrity_check failed: {err}"))?;
        if integrity != "ok" {
            return Err(format!("backup integrity_check returned {integrity}"));
        }
        let fk_errors: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .map_err(|err| format!("backup foreign_key_check failed: {err}"))?;
        if fk_errors != 0 {
            return Err(format!("backup has {fk_errors} foreign key errors"));
        }
        Ok(())
    }

    pub fn restore_backup(paths: &FulcrumPaths, backup: &str) -> Result<(), String> {
        Self::verify_backup(backup)?;
        if let Some(parent) = paths.db.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("failed to create db dir {}: {err}", parent.display()))?;
        }
        fs::copy(backup, &paths.db)
            .map_err(|err| format!("failed to restore backup to {}: {err}", paths.db.display()))?;
        Ok(())
    }

    fn append_event_with_attributes<I>(
        &self,
        kind: &str,
        subject: &str,
        message: &str,
        attributes: I,
    ) -> Result<(), String>
    where
        I: IntoIterator<Item = (&'static str, String)>,
    {
        let id = self.next_id("evt")?;
        let attributes = encode_attributes(attributes);
        self.conn
            .execute(
                "INSERT INTO events(id, kind, subject, message, attributes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                params![id, kind, subject, message, attributes],
            )
            .map_err(|err| format!("failed to append event: {err}"))?;
        Ok(())
    }

    fn count(&self, table: &str) -> Result<usize, String> {
        let sql = format!("SELECT COUNT(*) FROM {table}");
        self.conn
            .query_row(&sql, [], |row| row.get::<_, i64>(0))
            .map(|count| count as usize)
            .map_err(sql_err)
    }

    pub fn run_status(&self, run_id: &str) -> Result<String, String> {
        self.conn
            .query_row(
                "SELECT status FROM runs WHERE id = ?1",
                params![run_id],
                |row| row.get(0),
            )
            .map_err(|err| match err {
                rusqlite::Error::QueryReturnedNoRows => format!("run not found: {run_id}"),
                other => sql_err(other),
            })
    }

    fn enforce_run_transition(&self, run_id: &str, next_status: &str) -> Result<(), String> {
        let current_status = self.run_status(run_id)?;
        let decision = evaluate_run_transition(&current_status, next_status);
        if decision.allowed {
            Ok(())
        } else {
            Err(decision.reason)
        }
    }

    fn set_run_terminal_status(
        &self,
        run_id: &str,
        status: &str,
        event_kind: &str,
        reason: &str,
    ) -> Result<(), String> {
        self.enforce_run_transition(run_id, status)?;
        let changed = self
            .conn
            .execute(
                "UPDATE runs SET status = ?2 WHERE id = ?1",
                params![run_id, status],
            )
            .map_err(|err| format!("failed to update run: {err}"))?;
        if changed == 0 {
            return Err(format!("run not found: {run_id}"));
        }
        self.append_event_with_attributes(
            event_kind,
            run_id,
            reason,
            [("status", status.to_string())],
        )?;
        Ok(())
    }

    fn next_id(&self, prefix: &str) -> Result<String, String> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO id_counters(prefix, next_value) VALUES (?1, 1)",
                params![prefix],
            )
            .map_err(sql_err)?;
        let next = self
            .conn
            .query_row(
                "SELECT next_value FROM id_counters WHERE prefix = ?1",
                params![prefix],
                |row| row.get::<_, i64>(0),
            )
            .map_err(sql_err)?;
        self.conn
            .execute(
                "UPDATE id_counters SET next_value = next_value + 1 WHERE prefix = ?1",
                params![prefix],
            )
            .map_err(sql_err)?;
        Ok(format!("{prefix}_{next:06}"))
    }

    fn ensure_column(&self, table: &str, column: &str, definition: &str) -> Result<(), String> {
        let mut stmt = self
            .conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(sql_err)?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(sql_err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_err)?;
        if !columns.iter().any(|existing| existing == column) {
            self.conn
                .execute(
                    &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                    [],
                )
                .map_err(sql_err)?;
        }
        Ok(())
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn encode_attributes<I>(attributes: I) -> String
where
    I: IntoIterator<Item = (&'static str, String)>,
{
    attributes
        .into_iter()
        .map(|(key, value)| format!("{}={}", escape_attr(key), escape_attr(&value)))
        .collect::<Vec<_>>()
        .join("\n")
}

fn decode_attributes(encoded: &str) -> BTreeMap<String, String> {
    encoded
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            Some((unescape_attr(key), unescape_attr(value)))
        })
        .collect()
}

fn escape_attr(value: &str) -> String {
    value
        .replace('%', "%25")
        .replace('\n', "%0A")
        .replace('=', "%3D")
}

fn unescape_attr(value: &str) -> String {
    value
        .replace("%3D", "=")
        .replace("%0A", "\n")
        .replace("%25", "%")
}

fn sql_err(err: rusqlite::Error) -> String {
    err.to_string()
}
