use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use fulcrum_worktree::{
    Artifact, ArtifactKind, ArtifactStatus, CleanupOutcome, FindingSeverity, GitState,
    GitStatusProvider, MergeBlockReason, MergeOutcome, ReviewFinding, Worktree, WorktreeError,
    WorktreeId, WorktreeManager, WorktreeRequest, WorktreeState,
};

#[derive(Debug, Clone)]
struct FakeGitStatus {
    states: Rc<RefCell<HashMap<WorktreeId, GitState>>>,
    default: GitState,
}

impl FakeGitStatus {
    fn new(default: GitState) -> Self {
        Self {
            states: Rc::new(RefCell::new(HashMap::new())),
            default,
        }
    }

    fn set(&self, id: &WorktreeId, state: GitState) {
        self.states.borrow_mut().insert(id.clone(), state);
    }
}

impl GitStatusProvider for FakeGitStatus {
    fn status(&self, worktree: &Worktree) -> Result<GitState, WorktreeError> {
        Ok(self
            .states
            .borrow()
            .get(&worktree.id)
            .cloned()
            .unwrap_or_else(|| self.default.clone()))
    }
}

fn request(task: &str, run: &str) -> WorktreeRequest {
    WorktreeRequest {
        task_id: task.to_string(),
        run_id: run.to_string(),
        project_root: PathBuf::from("/repo"),
        base_branch: "main".to_string(),
        branch_name: format!("fulcrum/{task}-{run}"),
    }
}

fn final_artifact(kind: ArtifactKind, file: &str) -> Artifact {
    Artifact {
        kind,
        path: PathBuf::from(file),
        status: ArtifactStatus::Final,
    }
}

fn ready_for_merge(manager: &mut WorktreeManager<FakeGitStatus>, id: &WorktreeId) {
    manager.open_review(id).unwrap();
    manager
        .attach_artifact(id, final_artifact(ArtifactKind::ReviewReport, "review.md"))
        .unwrap();
    manager
        .attach_artifact(id, final_artifact(ArtifactKind::TestReport, "test.md"))
        .unwrap();
    manager.queue_merge(id).unwrap();
}

#[test]
fn clean_merge_applies_and_allows_cleanup() {
    let mut manager = WorktreeManager::new(FakeGitStatus::new(GitState::Clean));
    let id = manager.allocate(request("task-a", "run-a")).unwrap();

    ready_for_merge(&mut manager, &id);

    assert_eq!(
        manager.apply_next_merge().unwrap(),
        Some(MergeOutcome::Applied)
    );
    assert_eq!(manager.worktree(&id).unwrap().state, WorktreeState::Merged);
    assert_eq!(manager.cleanup(&id).unwrap(), CleanupOutcome::Removed);
    assert_eq!(manager.worktree(&id).unwrap().state, WorktreeState::Cleaned);
}

#[test]
fn dirty_after_merge_cleanup_refused() {
    let provider = FakeGitStatus::new(GitState::Clean);
    let mut manager = WorktreeManager::new(provider.clone());
    let id = manager
        .allocate(request("task-merged-dirty", "run-merged-dirty"))
        .unwrap();

    ready_for_merge(&mut manager, &id);
    assert_eq!(
        manager.apply_next_merge().unwrap(),
        Some(MergeOutcome::Applied)
    );
    provider.set(&id, GitState::Dirty);

    assert_eq!(
        manager.cleanup(&id).unwrap(),
        CleanupOutcome::Refused {
            reason: "merged worktree has uncommitted changes".to_string(),
        }
    );
    assert_eq!(manager.worktree(&id).unwrap().state, WorktreeState::Merged);
}

#[test]
fn conflict_blocks_merge_and_adds_conflict_artifact() {
    let provider = FakeGitStatus::new(GitState::Clean);
    let mut manager = WorktreeManager::new(provider.clone());
    let id = manager.allocate(request("task-b", "run-b")).unwrap();
    provider.set(&id, GitState::Conflict);
    ready_for_merge(&mut manager, &id);

    let outcome = manager.apply_merge(&id).unwrap();

    assert_eq!(
        outcome,
        MergeOutcome::Blocked(fulcrum_worktree::MergeBlock {
            reason: MergeBlockReason::Conflict,
            message: "worktree has merge conflicts".to_string(),
        })
    );
    let worktree = manager.worktree(&id).unwrap();
    assert_eq!(worktree.state, WorktreeState::MergeBlocked);
    assert!(
        worktree
            .artifacts
            .iter()
            .any(|artifact| artifact.kind == ArtifactKind::MergeConflictReport)
    );
}

#[test]
fn dirty_unmerged_cleanup_refused() {
    let provider = FakeGitStatus::new(GitState::Clean);
    let mut manager = WorktreeManager::new(provider.clone());
    let id = manager.allocate(request("task-c", "run-c")).unwrap();
    provider.set(&id, GitState::Dirty);

    assert_eq!(
        manager.cleanup(&id).unwrap(),
        CleanupOutcome::Refused {
            reason: "worktree must be merged before cleanup".to_string(),
        }
    );
    assert_eq!(
        manager.worktree(&id).unwrap().state,
        WorktreeState::Allocated
    );
}

#[test]
fn clean_unmerged_cleanup_refused() {
    let mut manager = WorktreeManager::new(FakeGitStatus::new(GitState::Clean));
    let id = manager
        .allocate(request("task-clean", "run-clean"))
        .unwrap();

    assert_eq!(
        manager.cleanup(&id).unwrap(),
        CleanupOutcome::Refused {
            reason: "worktree must be merged before cleanup".to_string(),
        }
    );
    assert_eq!(
        manager.worktree(&id).unwrap().state,
        WorktreeState::Allocated
    );
}

#[test]
fn artifact_attachment_keeps_kind_path_and_status() {
    let mut manager = WorktreeManager::new(FakeGitStatus::new(GitState::Clean));
    let id = manager.allocate(request("task-d", "run-d")).unwrap();
    let artifact = Artifact {
        kind: ArtifactKind::Custom("agent-log".to_string()),
        path: PathBuf::from("artifacts/run-d/log.txt"),
        status: ArtifactStatus::Draft,
    };

    manager.attach_artifact(&id, artifact.clone()).unwrap();

    assert_eq!(manager.worktree(&id).unwrap().artifacts, vec![artifact]);
}

#[test]
fn review_queue_tracks_open_reviews_and_findings() {
    let mut manager = WorktreeManager::new(FakeGitStatus::new(GitState::Clean));
    let first = manager.allocate(request("task-e", "run-e")).unwrap();
    let second = manager.allocate(request("task-f", "run-f")).unwrap();

    let review_id = manager.open_review(&first).unwrap();
    manager.open_review(&second).unwrap();
    manager
        .add_review_finding(
            &first,
            ReviewFinding {
                severity: FindingSeverity::Warning,
                path: PathBuf::from("src/lib.rs"),
                line: Some(42),
                message: "prefer smaller function".to_string(),
            },
        )
        .unwrap();

    assert_eq!(review_id.as_str(), "rev_1");
    assert_eq!(manager.review_queue(), vec![first.clone(), second]);
    assert_eq!(
        manager
            .worktree(&first)
            .unwrap()
            .review
            .as_ref()
            .unwrap()
            .findings[0]
            .message,
        "prefer smaller function"
    );
}

#[test]
fn blocking_review_finding_prevents_merge_before_status_check() {
    let mut manager = WorktreeManager::new(FakeGitStatus::new(GitState::Clean));
    let id = manager.allocate(request("task-g", "run-g")).unwrap();
    manager.open_review(&id).unwrap();
    manager
        .add_review_finding(
            &id,
            ReviewFinding {
                severity: FindingSeverity::Blocking,
                path: PathBuf::from("src/lib.rs"),
                line: None,
                message: "regression risk".to_string(),
            },
        )
        .unwrap();
    manager
        .attach_artifact(&id, final_artifact(ArtifactKind::ReviewReport, "review.md"))
        .unwrap();
    manager
        .attach_artifact(&id, final_artifact(ArtifactKind::TestReport, "test.md"))
        .unwrap();
    manager.queue_merge(&id).unwrap();

    assert_eq!(
        manager.apply_merge(&id).unwrap(),
        MergeOutcome::Blocked(fulcrum_worktree::MergeBlock {
            reason: MergeBlockReason::ReviewFinding,
            message: "review has blocking findings".to_string(),
        })
    );
}
