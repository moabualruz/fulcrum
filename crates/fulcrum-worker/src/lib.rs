use fulcrum_config::FulcrumPaths;
use fulcrum_storage::Storage;
use std::path::PathBuf;

pub trait WorkerAdapter {
    fn complete(&self, paths: &FulcrumPaths, run_id: &str) -> Result<WorkerResult, String>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerResult {
    pub run_id: String,
    pub artifact_path: PathBuf,
}

#[derive(Debug, Default)]
pub struct StubWorker;

impl WorkerAdapter for StubWorker {
    fn complete(&self, paths: &FulcrumPaths, run_id: &str) -> Result<WorkerResult, String> {
        let artifact_path = write_stub_artifact(paths, run_id)?;
        let storage = Storage::open(paths)?;
        storage.add_artifact(run_id, &artifact_path.display().to_string(), "stub-result")?;
        storage.complete_run(run_id)?;
        Ok(WorkerResult {
            run_id: run_id.to_string(),
            artifact_path,
        })
    }
}

pub fn complete_stub_run(paths: &FulcrumPaths, run_id: &str) -> Result<WorkerResult, String> {
    StubWorker.complete(paths, run_id)
}

fn write_stub_artifact(paths: &FulcrumPaths, run_id: &str) -> Result<PathBuf, String> {
    let run_artifact_dir = paths.artifacts.join(run_id);
    std::fs::create_dir_all(&run_artifact_dir).map_err(|err| {
        format!(
            "failed to create artifact dir {}: {err}",
            run_artifact_dir.display()
        )
    })?;
    let artifact_path = run_artifact_dir.join("stub-result.txt");
    std::fs::write(
        &artifact_path,
        format!("stub runner completed run {run_id}\n"),
    )
    .map_err(|err| {
        format!(
            "failed to write artifact {}: {err}",
            artifact_path.display()
        )
    })?;
    Ok(artifact_path)
}
