use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeRequest {
    pub task_id: String,
    pub run_id: String,
    pub project_root: PathBuf,
    pub base_branch: String,
    pub branch_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Worktree {
    pub id: WorktreeId,
    pub task_id: String,
    pub run_id: String,
    pub path: PathBuf,
    pub base_branch: String,
    pub branch_name: String,
    pub state: WorktreeState,
    pub artifacts: Vec<Artifact>,
    pub review: Option<Review>,
    pub merge_block: Option<MergeBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct WorktreeId(String);

impl WorktreeId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for WorktreeId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorktreeState {
    Allocated,
    ReviewOpen,
    MergeQueued,
    MergeBlocked,
    Merged,
    Cleaned,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Artifact {
    pub kind: ArtifactKind,
    pub path: PathBuf,
    pub status: ArtifactStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactKind {
    ReviewReport,
    TestReport,
    MergeConflictReport,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArtifactStatus {
    Draft,
    Final,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Review {
    pub id: ReviewId,
    pub findings: Vec<ReviewFinding>,
    pub status: ReviewStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ReviewId(String);

impl ReviewId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewStatus {
    Open,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewFinding {
    pub severity: FindingSeverity,
    pub path: PathBuf,
    pub line: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FindingSeverity {
    Info,
    Warning,
    Blocking,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeBlock {
    pub reason: MergeBlockReason,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeBlockReason {
    Dirty,
    Conflict,
    MissingReview,
    MissingArtifact(ArtifactKind),
    ReviewFinding,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitState {
    Clean,
    Dirty,
    Conflict,
}

pub trait GitStatusProvider {
    fn status(&self, worktree: &Worktree) -> Result<GitState, WorktreeError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CleanupOutcome {
    Removed,
    Refused { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeOutcome {
    Applied,
    Blocked(MergeBlock),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorktreeError {
    DuplicateWorktree(String),
    MissingWorktree(String),
    MissingReview(String),
    ReviewAlreadyOpen(String),
    MergeNotQueued(String),
    AlreadyMerged(String),
    AlreadyCleaned(String),
    Provider(String),
}

impl std::fmt::Display for WorktreeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateWorktree(id) => write!(formatter, "worktree {id} already exists"),
            Self::MissingWorktree(id) => write!(formatter, "worktree {id} does not exist"),
            Self::MissingReview(id) => write!(formatter, "worktree {id} has no open review"),
            Self::ReviewAlreadyOpen(id) => write!(formatter, "worktree {id} already has a review"),
            Self::MergeNotQueued(id) => write!(formatter, "worktree {id} is not queued for merge"),
            Self::AlreadyMerged(id) => write!(formatter, "worktree {id} is already merged"),
            Self::AlreadyCleaned(id) => write!(formatter, "worktree {id} is already cleaned"),
            Self::Provider(message) => write!(formatter, "{message}"),
        }
    }
}

impl std::error::Error for WorktreeError {}

#[derive(Debug)]
pub struct WorktreeManager<P> {
    provider: P,
    worktrees: HashMap<WorktreeId, Worktree>,
    review_queue: VecDeque<WorktreeId>,
    merge_queue: VecDeque<WorktreeId>,
    next_worktree: u64,
    next_review: u64,
}

impl<P: GitStatusProvider> WorktreeManager<P> {
    pub fn new(provider: P) -> Self {
        Self {
            provider,
            worktrees: HashMap::new(),
            review_queue: VecDeque::new(),
            merge_queue: VecDeque::new(),
            next_worktree: 1,
            next_review: 1,
        }
    }

    pub fn allocate(&mut self, request: WorktreeRequest) -> Result<WorktreeId, WorktreeError> {
        let id = WorktreeId::new(format!("wt_{}", self.next_worktree));
        self.next_worktree += 1;

        let path = request
            .project_root
            .join(".fulcrum-worktrees")
            .join(id.as_str());
        let worktree = Worktree {
            id: id.clone(),
            task_id: request.task_id,
            run_id: request.run_id,
            path,
            base_branch: request.base_branch,
            branch_name: request.branch_name,
            state: WorktreeState::Allocated,
            artifacts: Vec::new(),
            review: None,
            merge_block: None,
        };

        if self.worktrees.insert(id.clone(), worktree).is_some() {
            return Err(WorktreeError::DuplicateWorktree(id.to_string()));
        }

        Ok(id)
    }

    pub fn attach_artifact(
        &mut self,
        id: &WorktreeId,
        artifact: Artifact,
    ) -> Result<(), WorktreeError> {
        let worktree = self.worktree_mut(id)?;
        worktree.artifacts.push(artifact);
        Ok(())
    }

    pub fn detect_state(&self, id: &WorktreeId) -> Result<GitState, WorktreeError> {
        self.provider.status(self.worktree(id)?)
    }

    pub fn open_review(&mut self, id: &WorktreeId) -> Result<ReviewId, WorktreeError> {
        let review_id = ReviewId::new(format!("rev_{}", self.next_review));
        self.next_review += 1;

        let worktree = self.worktree_mut(id)?;
        if worktree.review.is_some() {
            return Err(WorktreeError::ReviewAlreadyOpen(id.to_string()));
        }

        worktree.review = Some(Review {
            id: review_id.clone(),
            findings: Vec::new(),
            status: ReviewStatus::Open,
        });
        worktree.state = WorktreeState::ReviewOpen;
        self.push_unique_review(id.clone());

        Ok(review_id)
    }

    pub fn add_review_finding(
        &mut self,
        id: &WorktreeId,
        finding: ReviewFinding,
    ) -> Result<(), WorktreeError> {
        let worktree = self.worktree_mut(id)?;
        let review = worktree
            .review
            .as_mut()
            .ok_or_else(|| WorktreeError::MissingReview(id.to_string()))?;

        review.findings.push(finding);
        Ok(())
    }

    pub fn queue_merge(&mut self, id: &WorktreeId) -> Result<(), WorktreeError> {
        let worktree = self.worktree_mut(id)?;
        worktree.state = WorktreeState::MergeQueued;
        worktree.merge_block = None;
        self.push_unique_merge(id.clone());
        Ok(())
    }

    pub fn apply_next_merge(&mut self) -> Result<Option<MergeOutcome>, WorktreeError> {
        let Some(id) = self.merge_queue.pop_front() else {
            return Ok(None);
        };

        self.apply_merge(&id).map(Some)
    }

    pub fn apply_merge(&mut self, id: &WorktreeId) -> Result<MergeOutcome, WorktreeError> {
        {
            let worktree = self.worktree(id)?;
            if worktree.state == WorktreeState::Merged {
                return Err(WorktreeError::AlreadyMerged(id.to_string()));
            }
            if worktree.state != WorktreeState::MergeQueued {
                return Err(WorktreeError::MergeNotQueued(id.to_string()));
            }
        }

        if let Some(block) = self.merge_gate_block(id)? {
            return self.block_merge(id, block);
        }

        match self.detect_state(id)? {
            GitState::Clean => {
                let worktree = self.worktree_mut(id)?;
                worktree.state = WorktreeState::Merged;
                worktree.merge_block = None;
                Ok(MergeOutcome::Applied)
            }
            GitState::Dirty => self.block_merge(
                id,
                MergeBlock {
                    reason: MergeBlockReason::Dirty,
                    message: "worktree has uncommitted changes".to_string(),
                },
            ),
            GitState::Conflict => self.block_merge(
                id,
                MergeBlock {
                    reason: MergeBlockReason::Conflict,
                    message: "worktree has merge conflicts".to_string(),
                },
            ),
        }
    }

    pub fn block_merge(
        &mut self,
        id: &WorktreeId,
        block: MergeBlock,
    ) -> Result<MergeOutcome, WorktreeError> {
        let worktree = self.worktree_mut(id)?;
        worktree.state = WorktreeState::MergeBlocked;
        worktree.merge_block = Some(block.clone());

        if block.reason == MergeBlockReason::Conflict {
            worktree.artifacts.push(Artifact {
                kind: ArtifactKind::MergeConflictReport,
                path: worktree.path.join("merge-conflict-report.txt"),
                status: ArtifactStatus::Final,
            });
        }

        Ok(MergeOutcome::Blocked(block))
    }

    pub fn cleanup(&mut self, id: &WorktreeId) -> Result<CleanupOutcome, WorktreeError> {
        {
            let worktree = self.worktree(id)?;
            if worktree.state == WorktreeState::Cleaned {
                return Err(WorktreeError::AlreadyCleaned(id.to_string()));
            }
            if worktree.state != WorktreeState::Merged {
                return Ok(CleanupOutcome::Refused {
                    reason: "worktree must be merged before cleanup".to_string(),
                });
            }
            if self.provider.status(worktree)? != GitState::Clean {
                return Ok(CleanupOutcome::Refused {
                    reason: "merged worktree has uncommitted changes".to_string(),
                });
            }
        }

        let worktree = self.worktree_mut(id)?;
        worktree.state = WorktreeState::Cleaned;
        Ok(CleanupOutcome::Removed)
    }

    pub fn worktree(&self, id: &WorktreeId) -> Result<&Worktree, WorktreeError> {
        self.worktrees
            .get(id)
            .ok_or_else(|| WorktreeError::MissingWorktree(id.to_string()))
    }

    pub fn review_queue(&self) -> Vec<WorktreeId> {
        self.review_queue.iter().cloned().collect()
    }

    pub fn merge_queue(&self) -> Vec<WorktreeId> {
        self.merge_queue.iter().cloned().collect()
    }

    fn worktree_mut(&mut self, id: &WorktreeId) -> Result<&mut Worktree, WorktreeError> {
        self.worktrees
            .get_mut(id)
            .ok_or_else(|| WorktreeError::MissingWorktree(id.to_string()))
    }

    fn merge_gate_block(&self, id: &WorktreeId) -> Result<Option<MergeBlock>, WorktreeError> {
        let worktree = self.worktree(id)?;
        let Some(review) = &worktree.review else {
            return Ok(Some(MergeBlock {
                reason: MergeBlockReason::MissingReview,
                message: "review must be opened before merge".to_string(),
            }));
        };

        if review
            .findings
            .iter()
            .any(|finding| finding.severity == FindingSeverity::Blocking)
        {
            return Ok(Some(MergeBlock {
                reason: MergeBlockReason::ReviewFinding,
                message: "review has blocking findings".to_string(),
            }));
        }

        for kind in [ArtifactKind::ReviewReport, ArtifactKind::TestReport] {
            if !worktree
                .artifacts
                .iter()
                .any(|artifact| artifact.kind == kind && artifact.status == ArtifactStatus::Final)
            {
                return Ok(Some(MergeBlock {
                    reason: MergeBlockReason::MissingArtifact(kind.clone()),
                    message: format!("missing final {kind:?} artifact"),
                }));
            }
        }

        Ok(None)
    }

    fn push_unique_review(&mut self, id: WorktreeId) {
        if !self.review_queue.contains(&id) {
            self.review_queue.push_back(id);
        }
    }

    fn push_unique_merge(&mut self, id: WorktreeId) {
        if !self.merge_queue.contains(&id) {
            self.merge_queue.push_back(id);
        }
    }
}
