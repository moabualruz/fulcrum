use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FulcrumPaths {
    pub home: PathBuf,
    pub config: PathBuf,
    pub db: PathBuf,
    pub logs: PathBuf,
    pub backups: PathBuf,
    pub sidecars: PathBuf,
    pub indexes: PathBuf,
    pub artifacts: PathBuf,
    pub worktrees: PathBuf,
    pub daemon_state: PathBuf,
    pub daemon_pid: PathBuf,
}

impl FulcrumPaths {
    pub fn discover() -> Self {
        let home = env::var_os("FULCRUM_HOME")
            .map(PathBuf::from)
            .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".fulcrum")))
            .unwrap_or_else(|| PathBuf::from(".fulcrum"));
        Self::from_home(home)
    }

    pub fn from_home(home: impl Into<PathBuf>) -> Self {
        let home = home.into();
        Self {
            config: home.join("config.toml"),
            db: home.join("fulcrum.db"),
            logs: home.join("logs"),
            backups: home.join("backups"),
            sidecars: home.join("sidecars"),
            indexes: home.join("indexes"),
            artifacts: home.join("artifacts"),
            worktrees: home.join("worktrees"),
            daemon_state: home.join("daemon.state"),
            daemon_pid: home.join("daemon.pid"),
            home,
        }
    }

    pub fn ensure(&self) -> Result<(), String> {
        for path in [
            &self.home,
            &self.logs,
            &self.backups,
            &self.sidecars,
            &self.indexes,
            &self.artifacts,
            &self.worktrees,
        ] {
            fs::create_dir_all(path)
                .map_err(|err| format!("failed to create {}: {err}", path.display()))?;
        }
        if !self.config.exists() {
            fs::write(&self.config, self.default_config())
                .map_err(|err| format!("failed to write {}: {err}", self.config.display()))?;
        }
        Ok(())
    }

    pub fn default_config(&self) -> String {
        format!(
            "profile = \"core\"\ndata_dir = \"{}\"\nremote_network = false\n",
            escape_toml_path(&self.home)
        )
    }

    pub fn write_daemon_state(&self, status: &str) -> Result<(), String> {
        self.write_daemon_state_with_endpoint(status, None)
    }

    pub fn write_daemon_state_with_endpoint(
        &self,
        status: &str,
        endpoint: Option<&str>,
    ) -> Result<(), String> {
        let mut content = format!("status = \"{status}\"\n");
        if let Some(endpoint) = endpoint {
            content.push_str(&format!("endpoint = \"{}\"\n", escape_toml_value(endpoint)));
        }
        fs::write(&self.daemon_state, content)
            .map_err(|err| format!("failed to write {}: {err}", self.daemon_state.display()))
    }

    pub fn write_daemon_pid(&self, pid: u32) -> Result<(), String> {
        fs::write(&self.daemon_pid, format!("{pid}\n"))
            .map_err(|err| format!("failed to write {}: {err}", self.daemon_pid.display()))
    }

    pub fn read_daemon_pid(&self) -> Option<u32> {
        fs::read_to_string(&self.daemon_pid)
            .ok()
            .and_then(|content| content.trim().parse::<u32>().ok())
    }

    pub fn read_daemon_state(&self) -> String {
        fs::read_to_string(&self.daemon_state)
            .ok()
            .and_then(|content| parse_quoted_field(&content, "status"))
            .unwrap_or_else(|| "stopped".to_string())
    }

    pub fn read_daemon_endpoint(&self) -> Option<String> {
        fs::read_to_string(&self.daemon_state)
            .ok()
            .and_then(|content| parse_quoted_field(&content, "endpoint"))
    }

    pub fn remove_managed_state(&self, preserve_backups: bool) -> Result<(), String> {
        if !self.home.exists() {
            return Ok(());
        }
        if preserve_backups {
            for entry in fs::read_dir(&self.home)
                .map_err(|err| format!("failed to read {}: {err}", self.home.display()))?
            {
                let entry = entry.map_err(|err| format!("failed to read home entry: {err}"))?;
                if entry.path() == self.backups {
                    continue;
                }
                remove_path(&entry.path())?;
            }
            Ok(())
        } else {
            remove_path(&self.home)
        }
    }
}

fn remove_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|err| format!("failed to remove {}: {err}", path.display()))
    } else if path.exists() {
        fs::remove_file(path).map_err(|err| format!("failed to remove {}: {err}", path.display()))
    } else {
        Ok(())
    }
}

fn escape_toml_path(path: &Path) -> String {
    escape_toml_value(&path.display().to_string())
}

fn escape_toml_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn parse_quoted_field(content: &str, key: &str) -> Option<String> {
    let prefix = format!("{key} = \"");
    content.lines().find_map(|line| {
        line.trim()
            .strip_prefix(&prefix)
            .and_then(|rest| rest.strip_suffix('"'))
            .map(str::to_string)
    })
}
