use std::fmt;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SetupProfile {
    Core,
    Code,
    Memory,
    Actions,
    Full,
}

impl SetupProfile {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Core => "core",
            Self::Code => "code",
            Self::Memory => "memory",
            Self::Actions => "actions",
            Self::Full => "full",
        }
    }
}

impl fmt::Display for SetupProfile {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum HostOs {
    Linux,
    Macos,
    Windows,
    Other,
}

impl HostOs {
    pub fn detect() -> Self {
        match std::env::consts::OS {
            "linux" => Self::Linux,
            "macos" => Self::Macos,
            "windows" => Self::Windows,
            _ => Self::Other,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum HostArch {
    X86_64,
    Aarch64,
    Other,
}

impl HostArch {
    pub fn detect() -> Self {
        match std::env::consts::ARCH {
            "x86_64" => Self::X86_64,
            "aarch64" => Self::Aarch64,
            _ => Self::Other,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::X86_64 => "x86_64",
            Self::Aarch64 => "aarch64",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Host {
    pub os: HostOs,
    pub arch: HostArch,
}

impl Host {
    pub fn detect() -> Self {
        Self {
            os: HostOs::detect(),
            arch: HostArch::detect(),
        }
    }

    pub fn linux_x86_64() -> Self {
        Self {
            os: HostOs::Linux,
            arch: HostArch::X86_64,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DependencyId {
    TreeSitterParsers,
    Zoekt,
    LanceDb,
    Python,
    Uv,
    LightRag,
    Docker,
    Windmill,
    Plane,
}

impl DependencyId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TreeSitterParsers => "tree-sitter-parsers",
            Self::Zoekt => "zoekt",
            Self::LanceDb => "lancedb",
            Self::Python => "python",
            Self::Uv => "uv",
            Self::LightRag => "lightrag",
            Self::Docker => "docker",
            Self::Windmill => "windmill",
            Self::Plane => "plane",
        }
    }
}

impl fmt::Display for DependencyId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DependencyKind {
    Embedded,
    CliTool,
    PythonPackage,
    OptionalSidecar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DependencyRequirement {
    Required,
    Optional,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dependency {
    pub id: DependencyId,
    pub label: &'static str,
    pub kind: DependencyKind,
    pub requirement: DependencyRequirement,
    pub purpose: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrossOsStrategy {
    pub linux: &'static str,
    pub macos: &'static str,
    pub windows: &'static str,
}

impl CrossOsStrategy {
    pub fn command_for(&self, host: Host) -> &'static str {
        match host.os {
            HostOs::Linux | HostOs::Other => self.linux,
            HostOs::Macos => self.macos,
            HostOs::Windows => self.windows,
        }
    }

    pub fn covers_all_supported_os(&self) -> bool {
        !self.linux.is_empty() && !self.macos.is_empty() && !self.windows.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepKind {
    DetectHost,
    PrepareDirectories,
    Install,
    HealthCheck,
    Uninstall,
    PreserveData,
    CertificationGate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlanStep {
    pub id: String,
    pub kind: StepKind,
    pub dependency: Option<DependencyId>,
    pub title: String,
    pub command: String,
    pub dry_run: bool,
    pub strategy: CrossOsStrategy,
}

impl PlanStep {
    pub fn is_dependency_step(&self) -> bool {
        self.dependency.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupPlan {
    pub profile: SetupProfile,
    pub host: Host,
    pub dependencies: Vec<Dependency>,
    pub steps: Vec<PlanStep>,
    pub health_checks: Vec<PlanStep>,
    pub certification: CertificationResult,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DependencyHealth {
    pub dependency: DependencyId,
    pub status: GateStatus,
    pub evidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupDoctorReport {
    pub profile: SetupProfile,
    pub health: Vec<DependencyHealth>,
}

impl SetupDoctorReport {
    pub fn passed(&self) -> bool {
        self.health
            .iter()
            .all(|health| health.status != GateStatus::Fail)
    }
}

pub trait HostProbe {
    fn command_available(&self, command: &str) -> bool;
    fn path_exists(&self, path: &Path) -> bool;

    fn fulcrum_home(&self) -> Option<PathBuf> {
        std::env::var_os("FULCRUM_HOME").map(PathBuf::from)
    }
}

#[derive(Debug, Default, Clone)]
pub struct CommandHostProbe {
    home: Option<PathBuf>,
}

impl CommandHostProbe {
    pub fn new(home: impl Into<PathBuf>) -> Self {
        Self {
            home: Some(home.into()),
        }
    }
}

impl HostProbe for CommandHostProbe {
    fn command_available(&self, command: &str) -> bool {
        command_exists(command)
    }

    fn path_exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn fulcrum_home(&self) -> Option<PathBuf> {
        self.home.clone().or_else(default_fulcrum_home)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallOptions {
    pub preserve_backups: bool,
}

impl Default for UninstallOptions {
    fn default() -> Self {
        Self {
            preserve_backups: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallPlan {
    pub profile: SetupProfile,
    pub host: Host,
    pub preserve_backups: bool,
    pub dependencies: Vec<Dependency>,
    pub steps: Vec<PlanStep>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateStatus {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CertificationGate {
    pub name: String,
    pub status: GateStatus,
    pub evidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CertificationResult {
    pub profile: SetupProfile,
    pub gates: Vec<CertificationGate>,
}

impl CertificationResult {
    pub fn passed(&self) -> bool {
        self.gates
            .iter()
            .all(|gate| gate.status != GateStatus::Fail)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DryRunReport {
    pub steps: Vec<PlanStep>,
}

impl DryRunReport {
    pub fn commands(&self) -> Vec<&str> {
        self.steps
            .iter()
            .map(|step| step.command.as_str())
            .collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SetupPlanner {
    host: Host,
}

impl SetupPlanner {
    pub fn new(host: Host) -> Self {
        Self { host }
    }

    pub fn for_current_host() -> Self {
        Self::new(Host::detect())
    }

    pub fn plan(&self, profile: SetupProfile) -> SetupPlan {
        let dependencies = dependencies_for(profile);
        let mut steps = vec![self.detect_step(profile), self.prepare_step(profile)];
        steps.extend(
            dependencies.iter().map(|dependency| {
                self.install_step(profile, dependency.id, dependency.requirement)
            }),
        );
        let health_checks = dependencies
            .iter()
            .map(|dependency| {
                self.health_check_step(profile, dependency.id, dependency.requirement)
            })
            .collect::<Vec<_>>();
        let certification = certify(profile, &dependencies, &steps, &health_checks);

        SetupPlan {
            profile,
            host: self.host,
            dependencies,
            steps,
            health_checks,
            certification,
        }
    }

    pub fn uninstall_plan(
        &self,
        profile: SetupProfile,
        options: UninstallOptions,
    ) -> UninstallPlan {
        let dependencies = dependencies_for(profile);
        let mut steps = vec![PlanStep {
            id: format!("uninstall:{}:stop", profile.as_str()),
            kind: StepKind::Uninstall,
            dependency: None,
            title: format!("Stop {} profile sidecars", profile),
            command: format!("dry-run: stop managed services for profile {}", profile),
            dry_run: true,
            strategy: generic_strategy("stop managed Fulcrum services"),
        }];

        for dependency in dependencies.iter().rev() {
            steps.push(self.uninstall_step(profile, dependency.id, dependency.requirement));
        }

        steps.push(if options.preserve_backups {
            PlanStep {
                id: format!("uninstall:{}:preserve-backups", profile.as_str()),
                kind: StepKind::PreserveData,
                dependency: None,
                title: "Preserve backups".to_string(),
                command: "dry-run: leave $FULCRUM_HOME/backups untouched".to_string(),
                dry_run: true,
                strategy: generic_strategy("preserve $FULCRUM_HOME/backups"),
            }
        } else {
            PlanStep {
                id: format!("uninstall:{}:delete-backups", profile.as_str()),
                kind: StepKind::Uninstall,
                dependency: None,
                title: "Delete backups".to_string(),
                command: "dry-run: delete $FULCRUM_HOME/backups after explicit opt-in".to_string(),
                dry_run: true,
                strategy: generic_strategy("delete $FULCRUM_HOME/backups"),
            }
        });

        UninstallPlan {
            profile,
            host: self.host,
            preserve_backups: options.preserve_backups,
            dependencies,
            steps,
        }
    }

    pub fn dry_run(&self, plan: &SetupPlan) -> DryRunReport {
        let mut steps = plan.steps.clone();
        steps.extend(plan.health_checks.clone());
        steps.extend(
            plan.certification
                .gates
                .iter()
                .enumerate()
                .map(|(index, gate)| PlanStep {
                    id: format!("cert:{}:{index}", plan.profile.as_str()),
                    kind: StepKind::CertificationGate,
                    dependency: None,
                    title: format!("Certification: {}", gate.name),
                    command: format!("dry-run: certify {} => {:?}", gate.name, gate.status),
                    dry_run: true,
                    strategy: generic_strategy("evaluate certification evidence locally"),
                }),
        );
        DryRunReport { steps }
    }

    pub fn doctor<P: HostProbe>(&self, profile: SetupProfile, probe: &P) -> SetupDoctorReport {
        let health = dependencies_for(profile)
            .into_iter()
            .map(|dependency| {
                let commands = health_commands(dependency.id);
                let host_command_ok = commands
                    .iter()
                    .any(|command| probe.command_available(command));
                let managed_paths = managed_dependency_paths(dependency.id, probe.fulcrum_home());
                let managed_path_ok = managed_paths.iter().any(|path| probe.path_exists(path));
                let dependency_ok = commands.is_empty() || host_command_ok || managed_path_ok;
                let status = match (dependency.requirement, dependency_ok) {
                    (_, true) => GateStatus::Pass,
                    (DependencyRequirement::Optional, false) => GateStatus::Warn,
                    (DependencyRequirement::Required, false) => GateStatus::Fail,
                };
                let evidence = if commands.is_empty() {
                    "embedded dependency; no host command required".to_string()
                } else if host_command_ok {
                    format!("found one of: {}", commands.join(", "))
                } else if managed_path_ok {
                    format!(
                        "found managed install path: {}",
                        managed_paths
                            .iter()
                            .find(|path| probe.path_exists(path))
                            .map(|path| path.display().to_string())
                            .unwrap_or_else(|| "$FULCRUM_HOME".to_string())
                    )
                } else {
                    format!(
                        "missing host commands ({}) and managed paths ({})",
                        commands.join(", "),
                        managed_paths
                            .iter()
                            .map(|path| path.display().to_string())
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                };
                DependencyHealth {
                    dependency: dependency.id,
                    status,
                    evidence,
                }
            })
            .collect();
        SetupDoctorReport { profile, health }
    }

    fn detect_step(&self, profile: SetupProfile) -> PlanStep {
        PlanStep {
            id: format!("setup:{}:detect-host", profile.as_str()),
            kind: StepKind::DetectHost,
            dependency: None,
            title: "Detect host operating system and architecture".to_string(),
            command: format!(
                "dry-run: host os={} arch={}",
                self.host.os.as_str(),
                self.host.arch.as_str()
            ),
            dry_run: true,
            strategy: generic_strategy("detect OS and CPU architecture with Rust std::env::consts"),
        }
    }

    fn prepare_step(&self, profile: SetupProfile) -> PlanStep {
        PlanStep {
            id: format!("setup:{}:prepare", profile.as_str()),
            kind: StepKind::PrepareDirectories,
            dependency: None,
            title: format!("Prepare Fulcrum directories for {} profile", profile),
            command: "dry-run: create $FULCRUM_HOME/{sidecars,indexes,artifacts,backups}"
                .to_string(),
            dry_run: true,
            strategy: generic_strategy("create Fulcrum state directories"),
        }
    }

    fn install_step(
        &self,
        profile: SetupProfile,
        dependency: DependencyId,
        requirement: DependencyRequirement,
    ) -> PlanStep {
        let strategy = install_strategy(dependency);
        let optional = match requirement {
            DependencyRequirement::Required => "",
            DependencyRequirement::Optional => " optional",
        };
        PlanStep {
            id: format!("setup:{}:install:{}", profile.as_str(), dependency.as_str()),
            kind: StepKind::Install,
            dependency: Some(dependency),
            title: format!("Install{optional} {dependency}"),
            command: format!("dry-run: {}", strategy.command_for(self.host)),
            dry_run: true,
            strategy,
        }
    }

    fn health_check_step(
        &self,
        profile: SetupProfile,
        dependency: DependencyId,
        requirement: DependencyRequirement,
    ) -> PlanStep {
        let strategy = health_strategy(dependency);
        let optional = match requirement {
            DependencyRequirement::Required => "",
            DependencyRequirement::Optional => " optional",
        };
        PlanStep {
            id: format!("setup:{}:health:{}", profile.as_str(), dependency.as_str()),
            kind: StepKind::HealthCheck,
            dependency: Some(dependency),
            title: format!("Check{optional} {dependency} health"),
            command: format!("dry-run: {}", strategy.command_for(self.host)),
            dry_run: true,
            strategy,
        }
    }

    fn uninstall_step(
        &self,
        profile: SetupProfile,
        dependency: DependencyId,
        requirement: DependencyRequirement,
    ) -> PlanStep {
        let strategy = uninstall_strategy(dependency);
        let optional = match requirement {
            DependencyRequirement::Required => "",
            DependencyRequirement::Optional => " optional",
        };
        PlanStep {
            id: format!(
                "uninstall:{}:remove:{}",
                profile.as_str(),
                dependency.as_str()
            ),
            kind: StepKind::Uninstall,
            dependency: Some(dependency),
            title: format!("Remove{optional} {dependency}"),
            command: format!("dry-run: {}", strategy.command_for(self.host)),
            dry_run: true,
            strategy,
        }
    }
}

fn dependencies_for(profile: SetupProfile) -> Vec<Dependency> {
    let mut dependencies = Vec::new();
    if matches!(profile, SetupProfile::Code | SetupProfile::Full) {
        dependencies.extend([
            dependency(
                DependencyId::TreeSitterParsers,
                "Tree-sitter parsers",
                DependencyKind::Embedded,
                DependencyRequirement::Required,
                "parse source files into symbol and chunk metadata",
            ),
            dependency(
                DependencyId::Zoekt,
                "Zoekt",
                DependencyKind::CliTool,
                DependencyRequirement::Required,
                "local lexical code search sidecar",
            ),
            dependency(
                DependencyId::LanceDb,
                "LanceDB",
                DependencyKind::Embedded,
                DependencyRequirement::Required,
                "local semantic code vector store",
            ),
        ]);
    }
    if matches!(profile, SetupProfile::Memory | SetupProfile::Full) {
        dependencies.extend([
            dependency(
                DependencyId::Python,
                "Python",
                DependencyKind::CliTool,
                DependencyRequirement::Required,
                "LightRAG runtime interpreter",
            ),
            dependency(
                DependencyId::Uv,
                "uv",
                DependencyKind::CliTool,
                DependencyRequirement::Required,
                "locked Python environment manager",
            ),
            dependency(
                DependencyId::LightRag,
                "LightRAG",
                DependencyKind::PythonPackage,
                DependencyRequirement::Required,
                "local memory retrieval and graph indexing engine",
            ),
        ]);
    }
    if matches!(profile, SetupProfile::Actions | SetupProfile::Full) {
        dependencies.extend([
            dependency(
                DependencyId::Docker,
                "Docker",
                DependencyKind::CliTool,
                DependencyRequirement::Optional,
                "container runtime for optional action sidecars",
            ),
            dependency(
                DependencyId::Windmill,
                "Windmill",
                DependencyKind::OptionalSidecar,
                DependencyRequirement::Optional,
                "optional local workflow runner",
            ),
        ]);
    }
    if matches!(profile, SetupProfile::Full) {
        dependencies.extend([dependency(
            DependencyId::Plane,
            "Plane",
            DependencyKind::OptionalSidecar,
            DependencyRequirement::Optional,
            "optional local project planning sidecar",
        )]);
    }
    dependencies
}

fn dependency(
    id: DependencyId,
    label: &'static str,
    kind: DependencyKind,
    requirement: DependencyRequirement,
    purpose: &'static str,
) -> Dependency {
    Dependency {
        id,
        label,
        kind,
        requirement,
        purpose,
    }
}

fn install_strategy(dependency: DependencyId) -> CrossOsStrategy {
    match dependency {
        DependencyId::TreeSitterParsers => CrossOsStrategy {
            linux: "prepare vendored tree-sitter parser bundle under $FULCRUM_HOME/parsers",
            macos: "prepare vendored tree-sitter parser bundle under $FULCRUM_HOME/parsers",
            windows: "prepare vendored tree-sitter parser bundle under %FULCRUM_HOME%\\parsers",
        },
        DependencyId::Zoekt => CrossOsStrategy {
            linux: "install zoekt binary from pinned release into $FULCRUM_HOME/sidecars/zoekt",
            macos: "install zoekt binary from pinned release into $FULCRUM_HOME/sidecars/zoekt",
            windows: "install zoekt.exe from pinned release into %FULCRUM_HOME%\\sidecars\\zoekt",
        },
        DependencyId::LanceDb => CrossOsStrategy {
            linux: "provision lancedb local store under $FULCRUM_HOME/indexes/lancedb",
            macos: "provision lancedb local store under $FULCRUM_HOME/indexes/lancedb",
            windows: "provision lancedb local store under %FULCRUM_HOME%\\indexes\\lancedb",
        },
        DependencyId::Python => CrossOsStrategy {
            linux: "verify python3 >= 3.11 or use uv-managed interpreter",
            macos: "verify python3 >= 3.11 or use uv-managed interpreter",
            windows: "verify py -3.11 or use uv-managed interpreter",
        },
        DependencyId::Uv => CrossOsStrategy {
            linux: "install uv from pinned standalone binary into $FULCRUM_HOME/bin",
            macos: "install uv from pinned standalone binary into $FULCRUM_HOME/bin",
            windows: "install uv.exe from pinned standalone binary into %FULCRUM_HOME%\\bin",
        },
        DependencyId::LightRag => CrossOsStrategy {
            linux: "uv sync --project $FULCRUM_HOME/sidecars/lightrag --locked",
            macos: "uv sync --project $FULCRUM_HOME/sidecars/lightrag --locked",
            windows: "uv sync --project %FULCRUM_HOME%\\sidecars\\lightrag --locked",
        },
        DependencyId::Docker => CrossOsStrategy {
            linux: "verify docker engine or compatible container runtime",
            macos: "verify Docker Desktop, Colima, or compatible container runtime",
            windows: "verify Docker Desktop with WSL2 backend",
        },
        DependencyId::Windmill => CrossOsStrategy {
            linux: "docker compose -f $FULCRUM_HOME/sidecars/windmill/compose.yaml pull",
            macos: "docker compose -f $FULCRUM_HOME/sidecars/windmill/compose.yaml pull",
            windows: "docker compose -f %FULCRUM_HOME%\\sidecars\\windmill\\compose.yaml pull",
        },
        DependencyId::Plane => CrossOsStrategy {
            linux: "docker compose -f $FULCRUM_HOME/sidecars/plane/compose.yaml pull",
            macos: "docker compose -f $FULCRUM_HOME/sidecars/plane/compose.yaml pull",
            windows: "docker compose -f %FULCRUM_HOME%\\sidecars\\plane\\compose.yaml pull",
        },
    }
}

fn health_strategy(dependency: DependencyId) -> CrossOsStrategy {
    match dependency {
        DependencyId::TreeSitterParsers => {
            generic_strategy("parse built-in Rust and TypeScript fixtures")
        }
        DependencyId::Zoekt => {
            generic_strategy("run zoekt-indexserver --version and local smoke query")
        }
        DependencyId::LanceDb => {
            generic_strategy("open local LanceDB store and write/read smoke vector")
        }
        DependencyId::Python => generic_strategy("run Python version check"),
        DependencyId::Uv => generic_strategy("run uv --version"),
        DependencyId::LightRag => generic_strategy("import LightRAG module inside uv environment"),
        DependencyId::Docker => generic_strategy("run docker version and compose version"),
        DependencyId::Windmill => {
            generic_strategy("check Windmill compose config and local health endpoint")
        }
        DependencyId::Plane => {
            generic_strategy("check Plane compose config and local health endpoint")
        }
    }
}

fn health_commands(dependency: DependencyId) -> Vec<&'static str> {
    match dependency {
        DependencyId::TreeSitterParsers | DependencyId::LanceDb => Vec::new(),
        DependencyId::Zoekt => vec!["zoekt-indexserver", "zoekt"],
        DependencyId::Python => vec!["python3", "python"],
        DependencyId::Uv => vec!["uv"],
        DependencyId::LightRag => vec!["lightrag"],
        DependencyId::Docker | DependencyId::Windmill | DependencyId::Plane => vec!["docker"],
    }
}

fn managed_dependency_paths(dependency: DependencyId, home: Option<PathBuf>) -> Vec<PathBuf> {
    let Some(home) = home else { return Vec::new() };
    match dependency {
        DependencyId::Zoekt => vec![
            home.join("sidecars/zoekt/zoekt-indexserver"),
            home.join("sidecars/zoekt/zoekt-indexserver.exe"),
            home.join("sidecars/zoekt/zoekt"),
            home.join("sidecars/zoekt/zoekt.exe"),
        ],
        DependencyId::Python => vec![
            home.join("bin/python"),
            home.join("bin/python.exe"),
            home.join("bin/python3"),
        ],
        DependencyId::Uv => vec![home.join("bin/uv"), home.join("bin/uv.exe")],
        DependencyId::LightRag => vec![
            home.join("sidecars/lightrag"),
            home.join("sidecars/lightrag/.venv"),
        ],
        DependencyId::Windmill => vec![home.join("sidecars/windmill/compose.yaml")],
        DependencyId::Plane => vec![home.join("sidecars/plane/compose.yaml")],
        DependencyId::TreeSitterParsers | DependencyId::LanceDb | DependencyId::Docker => {
            Vec::new()
        }
    }
}

fn default_fulcrum_home() -> Option<PathBuf> {
    std::env::var_os("FULCRUM_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".fulcrum")))
        .or_else(|| {
            std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".fulcrum"))
        })
}

fn uninstall_strategy(dependency: DependencyId) -> CrossOsStrategy {
    match dependency {
        DependencyId::TreeSitterParsers => generic_strategy("remove vendored parser bundle"),
        DependencyId::Zoekt => {
            generic_strategy("stop zoekt and remove managed binary/index metadata")
        }
        DependencyId::LanceDb => generic_strategy("remove LanceDB derived index store"),
        DependencyId::Python => {
            generic_strategy("keep system Python; remove only Fulcrum-managed interpreter links")
        }
        DependencyId::Uv => generic_strategy("remove Fulcrum-managed uv binary"),
        DependencyId::LightRag => {
            generic_strategy("remove Fulcrum-managed LightRAG uv environment")
        }
        DependencyId::Docker => {
            generic_strategy("keep Docker installation; remove only Fulcrum compose assets")
        }
        DependencyId::Windmill => {
            generic_strategy("docker compose down Windmill and remove managed compose assets")
        }
        DependencyId::Plane => {
            generic_strategy("docker compose down Plane and remove managed compose assets")
        }
    }
}

fn generic_strategy(action: &'static str) -> CrossOsStrategy {
    CrossOsStrategy {
        linux: action,
        macos: action,
        windows: action,
    }
}

fn command_exists(command: &str) -> bool {
    if command.contains(std::path::MAIN_SEPARATOR) {
        return Path::new(command).is_file();
    }
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&paths).any(|dir| {
        let candidate = dir.join(command);
        if candidate.is_file() {
            return true;
        }
        #[cfg(windows)]
        {
            let pathext = std::env::var_os("PATHEXT")
                .map(|value| {
                    value
                        .to_string_lossy()
                        .split(';')
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_else(|| {
                    vec![".EXE".to_string(), ".BAT".to_string(), ".CMD".to_string()]
                });
            return pathext
                .iter()
                .any(|extension| dir.join(format!("{command}{extension}")).is_file());
        }
        #[allow(unreachable_code)]
        false
    })
}

fn certify(
    profile: SetupProfile,
    dependencies: &[Dependency],
    install_steps: &[PlanStep],
    health_checks: &[PlanStep],
) -> CertificationResult {
    let required_count = dependencies
        .iter()
        .filter(|dependency| dependency.requirement == DependencyRequirement::Required)
        .count();
    let optional_count = dependencies.len() - required_count;
    let dependency_steps_have_strategy = install_steps
        .iter()
        .chain(health_checks)
        .filter(|step| step.is_dependency_step())
        .all(|step| step.strategy.covers_all_supported_os());

    let mut gates = vec![
        CertificationGate {
            name: "host-targeted-plan".to_string(),
            status: GateStatus::Pass,
            evidence: "plan includes host OS and architecture detection".to_string(),
        },
        CertificationGate {
            name: "required-dependencies-planned".to_string(),
            status: if dependencies.iter().all(|dependency| {
                dependency.requirement == DependencyRequirement::Optional
                    || install_steps
                        .iter()
                        .any(|step| step.dependency == Some(dependency.id))
            }) {
                GateStatus::Pass
            } else {
                GateStatus::Fail
            },
            evidence: format!("{required_count} required dependencies planned"),
        },
        CertificationGate {
            name: "health-checks-planned".to_string(),
            status: if dependencies.iter().all(|dependency| {
                health_checks
                    .iter()
                    .any(|step| step.dependency == Some(dependency.id))
            }) {
                GateStatus::Pass
            } else {
                GateStatus::Fail
            },
            evidence: format!("{} health checks planned", health_checks.len()),
        },
        CertificationGate {
            name: "cross-os-strategy".to_string(),
            status: if dependency_steps_have_strategy {
                GateStatus::Pass
            } else {
                GateStatus::Fail
            },
            evidence:
                "dependency install and health steps include Linux, macOS, and Windows strategies"
                    .to_string(),
        },
    ];

    if optional_count > 0 {
        gates.push(CertificationGate {
            name: "optional-sidecars".to_string(),
            status: GateStatus::Warn,
            evidence: format!("{optional_count} optional sidecars require explicit enablement"),
        });
    }

    CertificationResult { profile, gates }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    fn ids(plan: &SetupPlan) -> Vec<DependencyId> {
        plan.dependencies
            .iter()
            .map(|dependency| dependency.id)
            .collect()
    }

    #[derive(Debug, Default)]
    struct FakeProbe {
        commands: BTreeSet<&'static str>,
        paths: BTreeSet<PathBuf>,
        home: Option<PathBuf>,
    }

    impl FakeProbe {
        fn with(commands: &[&'static str]) -> Self {
            Self {
                commands: commands.iter().copied().collect(),
                paths: BTreeSet::new(),
                home: None,
            }
        }

        fn with_managed_path(home: PathBuf, path: PathBuf) -> Self {
            Self {
                commands: BTreeSet::new(),
                paths: [path].into_iter().collect(),
                home: Some(home),
            }
        }
    }

    impl HostProbe for FakeProbe {
        fn command_available(&self, command: &str) -> bool {
            self.commands.contains(command)
        }

        fn path_exists(&self, path: &Path) -> bool {
            self.paths.contains(path)
        }

        fn fulcrum_home(&self) -> Option<PathBuf> {
            self.home.clone()
        }
    }

    #[test]
    fn core_has_no_external_sidecars() {
        let plan = SetupPlanner::new(Host::linux_x86_64()).plan(SetupProfile::Core);

        assert!(plan.dependencies.is_empty());
        assert!(plan.health_checks.is_empty());
        assert!(plan.certification.passed());
        assert!(plan.steps.iter().all(|step| step.dependency.is_none()));
    }

    #[test]
    fn code_includes_code_indexing_dependencies() {
        let plan = SetupPlanner::new(Host::linux_x86_64()).plan(SetupProfile::Code);
        let ids = ids(&plan);

        assert_eq!(
            ids,
            vec![
                DependencyId::TreeSitterParsers,
                DependencyId::Zoekt,
                DependencyId::LanceDb,
            ]
        );
    }

    #[test]
    fn memory_includes_lightrag_uv_python() {
        let plan = SetupPlanner::new(Host::linux_x86_64()).plan(SetupProfile::Memory);
        let ids = ids(&plan);

        assert_eq!(
            ids,
            vec![
                DependencyId::Python,
                DependencyId::Uv,
                DependencyId::LightRag
            ]
        );
    }

    #[test]
    fn full_includes_optional_windmill_and_plane() {
        let plan = SetupPlanner::new(Host::linux_x86_64()).plan(SetupProfile::Full);
        let windmill = plan
            .dependencies
            .iter()
            .find(|dependency| dependency.id == DependencyId::Windmill)
            .expect("Windmill dependency planned");
        let plane = plan
            .dependencies
            .iter()
            .find(|dependency| dependency.id == DependencyId::Plane)
            .expect("Plane dependency planned");

        assert_eq!(windmill.requirement, DependencyRequirement::Optional);
        assert_eq!(plane.requirement, DependencyRequirement::Optional);
        assert!(ids(&plan).contains(&DependencyId::Docker));
        assert!(plan.certification.passed());
    }

    #[test]
    fn actions_includes_optional_windmill_but_not_plane() {
        let plan = SetupPlanner::new(Host::linux_x86_64()).plan(SetupProfile::Actions);
        let ids = ids(&plan);

        assert_eq!(ids, vec![DependencyId::Docker, DependencyId::Windmill]);
        assert!(!ids.contains(&DependencyId::Plane));
        assert!(
            plan.dependencies
                .iter()
                .all(|dependency| dependency.requirement == DependencyRequirement::Optional)
        );
    }

    #[test]
    fn uninstall_preserves_backups_by_default() {
        let uninstall = SetupPlanner::new(Host::linux_x86_64())
            .uninstall_plan(SetupProfile::Full, UninstallOptions::default());

        assert!(uninstall.preserve_backups);
        assert!(uninstall.steps.iter().any(|step| {
            step.kind == StepKind::PreserveData && step.command.contains("backups untouched")
        }));
    }

    #[test]
    fn all_dependency_steps_expose_cross_os_strategy() {
        let planner = SetupPlanner::new(Host::linux_x86_64());

        for profile in [
            SetupProfile::Core,
            SetupProfile::Code,
            SetupProfile::Memory,
            SetupProfile::Actions,
            SetupProfile::Full,
        ] {
            let plan = planner.plan(profile);
            let uninstall = planner.uninstall_plan(profile, UninstallOptions::default());

            for step in plan
                .steps
                .iter()
                .chain(plan.health_checks.iter())
                .chain(uninstall.steps.iter())
                .filter(|step| step.is_dependency_step())
            {
                assert!(
                    step.strategy.covers_all_supported_os(),
                    "{} missing cross-OS strategy",
                    step.id
                );
            }
        }
    }

    #[test]
    fn dry_run_model_never_executes_real_install_commands() {
        let planner = SetupPlanner::new(Host::linux_x86_64());
        let plan = planner.plan(SetupProfile::Full);
        let report = planner.dry_run(&plan);

        assert!(!report.steps.is_empty());
        assert!(report.steps.iter().all(|step| step.dry_run));
        assert!(
            report
                .commands()
                .iter()
                .all(|command| command.starts_with("dry-run:"))
        );
    }

    #[test]
    fn doctor_fails_missing_required_host_dependencies() {
        let report = SetupPlanner::new(Host::linux_x86_64())
            .doctor(SetupProfile::Memory, &FakeProbe::default());

        assert!(!report.passed());
        assert!(report.health.iter().any(|health| {
            health.dependency == DependencyId::Python && health.status == GateStatus::Fail
        }));
        assert!(report.health.iter().any(|health| {
            health.dependency == DependencyId::LightRag && health.status == GateStatus::Fail
        }));
    }

    #[test]
    fn doctor_warns_missing_optional_sidecars() {
        let report = SetupPlanner::new(Host::linux_x86_64())
            .doctor(SetupProfile::Actions, &FakeProbe::default());

        assert!(report.passed());
        assert!(
            report
                .health
                .iter()
                .all(|health| health.status == GateStatus::Warn)
        );
    }

    #[test]
    fn doctor_passes_when_required_commands_are_available() {
        let report = SetupPlanner::new(Host::linux_x86_64()).doctor(
            SetupProfile::Memory,
            &FakeProbe::with(&["python3", "uv", "lightrag"]),
        );

        assert!(report.passed());
    }

    #[test]
    fn doctor_accepts_fulcrum_managed_dependency_paths() {
        let home = PathBuf::from("/tmp/fulcrum-managed");
        let report = SetupPlanner::new(Host::linux_x86_64()).doctor(
            SetupProfile::Memory,
            &FakeProbe::with_managed_path(home.clone(), home.join("sidecars/lightrag/.venv")),
        );

        assert!(report.health.iter().any(|health| {
            health.dependency == DependencyId::LightRag && health.status == GateStatus::Pass
        }));
    }
}
