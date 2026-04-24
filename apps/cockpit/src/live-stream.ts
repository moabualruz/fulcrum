export const TASK_STATUSES = ['open', 'running', 'blocked', 'done', 'failed'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type RunStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'canceled' | 'failed'
export type QueueStatus = 'requested' | 'in_review' | 'approved' | 'changes_requested' | 'ready' | 'blocked' | 'merged' | 'failed'
export type ArtifactState = 'pending' | 'ready' | 'failed'
export type HealthStatus = 'available' | 'degraded' | 'missing'

export type DashboardSummary = {
  tasksOpen: number
  tasksRunning: number
  tasksBlocked: number
  tasksDone: number
  tasksFailed: number
  activeRuns: number
  blockers: number
  artifacts: number
  reviews: number
  merges: number
  policies: number
  events: number
}

export type TaskCard = {
  id: string
  workspaceId: string
  projectId: string
  projectName: string
  title: string
  status: TaskStatus
  owner?: string
  runId?: string
  blockers?: string[]
}

export type BoardColumns = Record<TaskStatus, TaskCard[]>

export type ProjectTaskBoard = {
  projectId: string
  projectName: string
  columns: BoardColumns
}

export type TaskBoard = {
  global: BoardColumns
  projects: ProjectTaskBoard[]
}

export type ActiveRun = {
  id: string
  taskId: string
  projectId?: string
  taskTitle?: string
  agentRole: string
  status: RunStatus
  startedAtMs?: number
  lastEventId?: string
  note?: string
  blockingReason?: string
}

export type Blocker = {
  id: string
  taskId?: string
  runId?: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  status: 'open' | 'resolved'
}

export type Artifact = {
  id: string
  runId: string
  taskId?: string
  kind: string
  path: string
  label?: string
  state: ArtifactState
}

export type ReviewQueueItem = {
  id: string
  taskId: string
  title: string
  status: Extract<QueueStatus, 'requested' | 'in_review' | 'approved' | 'changes_requested'>
  reviewer?: string
  runId?: string
}

export type MergeQueueItem = {
  id: string
  taskId: string
  title: string
  status: Extract<QueueStatus, 'ready' | 'blocked' | 'merged' | 'failed'>
  target?: string
  reason?: string
  runId?: string
}

export type PolicyDecision = {
  id: string
  subjectKind: string
  subjectId: string
  allowed: boolean
  reason: string
  atMs?: number
}

export type HealthItem = {
  key: string
  status: HealthStatus
  message: string
  capability?: string
  boundary?: string
  checkedAtMs?: number
}

export type LiveEventDto = {
  id: string
  kind: string
  subject: string
  message: string
  atMs: number
  attributes?: Record<string, string>
}

export type CockpitSnapshot = {
  taskBoard: TaskBoard
  activeRuns: ActiveRun[]
  blockers: Blocker[]
  artifacts: Artifact[]
  reviewQueue: ReviewQueueItem[]
  mergeQueue: MergeQueueItem[]
  policyDecisions: PolicyDecision[]
  adapterHealth: HealthItem[]
  events: LiveEventDto[]
  summary?: DashboardSummary

  tasksOpen?: number
  tasksRunning?: number
  tasksDone?: number
  activeRunCount?: number
  health?: HealthItem[]
  eventCount?: number
}

export function summarizeSnapshot(snapshot: CockpitSnapshot): string {
  const summary = dashboardSummary(snapshot)
  return [
    `open=${summary.tasksOpen}`,
    `running=${summary.tasksRunning}`,
    `blocked=${summary.tasksBlocked}`,
    `done=${summary.tasksDone}`,
    `failed=${summary.tasksFailed}`,
    `activeRuns=${summary.activeRuns}`,
    `blockers=${summary.blockers}`,
    `artifacts=${summary.artifacts}`,
    `reviews=${summary.reviews}`,
    `merges=${summary.merges}`,
    `policies=${summary.policies}`,
    `health=${healthItems(snapshot).length}`,
    `events=${summary.events}`,
  ].join(' ')
}

export function healthLabels(snapshot: CockpitSnapshot): string[] {
  return healthItems(snapshot).map((item) => `${item.key}:${item.status} ${item.message}`)
}

export function healthDegradationLabels(snapshot: CockpitSnapshot): string[] {
  return healthItems(snapshot)
    .filter((item) => item.status !== 'available')
    .map((item) => `${item.key}:${item.status} ${item.message}`)
}

export function dashboardSummary(snapshot: CockpitSnapshot): DashboardSummary {
  if (snapshot.summary) return snapshot.summary

  const global = snapshot.taskBoard.global
  return {
    tasksOpen: snapshot.tasksOpen ?? global.open.length,
    tasksRunning: snapshot.tasksRunning ?? global.running.length,
    tasksBlocked: global.blocked.length,
    tasksDone: snapshot.tasksDone ?? global.done.length,
    tasksFailed: global.failed.length,
    activeRuns: snapshot.activeRunCount ?? snapshot.activeRuns.filter((run) => run.status === 'running').length,
    blockers: snapshot.blockers.filter((blocker) => blocker.status === 'open').length,
    artifacts: snapshot.artifacts.length,
    reviews: snapshot.reviewQueue.filter((item) => item.status !== 'approved').length,
    merges: snapshot.mergeQueue.filter((item) => item.status !== 'merged').length,
    policies: snapshot.policyDecisions.length,
    events: snapshot.eventCount ?? snapshot.events.length,
  }
}

export function healthItems(snapshot: CockpitSnapshot): HealthItem[] {
  return snapshot.adapterHealth.length > 0 ? snapshot.adapterHealth : (snapshot.health ?? [])
}

export function createEmptyBoardColumns(): BoardColumns {
  return {
    open: [],
    running: [],
    blocked: [],
    done: [],
    failed: [],
  }
}

export function createEmptySnapshot(): CockpitSnapshot {
  return {
    taskBoard: { global: createEmptyBoardColumns(), projects: [] },
    activeRuns: [],
    blockers: [],
    artifacts: [],
    reviewQueue: [],
    mergeQueue: [],
    policyDecisions: [],
    adapterHealth: [],
    events: [],
  }
}

export function liveEventFromSseData(id: string, kind: string, data: string, atMs = Date.now()): LiveEventDto {
  const subjectMatch = data.match(/(?:^|\s)subject=([^\s]+)/)
  const firstAttr = data.indexOf(' attr.')
  const messageStart = data.indexOf(' message=')
  const message =
    messageStart >= 0
      ? data.slice(messageStart + ' message='.length, firstAttr >= 0 ? firstAttr : undefined)
      : ''
  const attributes: Record<string, string> = {}
  for (const match of data.matchAll(/ attr\.([^=\s]+)=([^\s]*)/g)) {
    attributes[match[1]] = decodeSseValue(match[2])
  }
  return {
    id,
    kind,
    subject: subjectMatch ? decodeSseValue(subjectMatch[1]) : '',
    message,
    atMs,
    attributes,
  }
}

export function appendLiveEvent(snapshot: CockpitSnapshot, event: LiveEventDto): CockpitSnapshot {
  const next = cloneSnapshot(snapshot)
  if (!next.events.some((seen) => seen.id === event.id)) {
    next.events.push(event)
  }

  applyEventToState(next, event)
  next.summary = dashboardSummary({ ...next, summary: undefined })
  return next
}

export function applyLiveEvents(snapshot: CockpitSnapshot, events: LiveEventDto[]): CockpitSnapshot {
  return events.reduce((state, event) => appendLiveEvent(state, event), snapshot)
}

export function boardLines(board: TaskBoard): string[] {
  const lines = TASK_STATUSES.map((status) => `${status}:${board.global[status].map((task) => task.id).join(',') || '-'}`)
  for (const project of board.projects) {
    const parts = TASK_STATUSES.map((status) => `${status}=${project.columns[status].length}`)
    lines.push(`${project.projectName} ${parts.join(' ')}`)
  }
  return lines
}

export function queueLines(snapshot: CockpitSnapshot): string[] {
  const reviews = snapshot.reviewQueue.map((item) => `review:${item.id}:${item.status}:${item.title}`)
  const merges = snapshot.mergeQueue.map((item) => `merge:${item.id}:${item.status}:${item.title}`)
  return [...reviews, ...merges]
}

export function artifactLines(snapshot: CockpitSnapshot): string[] {
  return snapshot.artifacts.map((artifact) => `artifact:${artifact.id}:${artifact.state}:${artifact.kind}:${artifact.path}`)
}

export function policyLines(snapshot: CockpitSnapshot): string[] {
  return snapshot.policyDecisions.map((decision) => {
    const outcome = decision.allowed ? 'allowed' : 'denied'
    return `policy:${decision.id}:${outcome}:${decision.subjectKind}:${decision.subjectId}:${decision.reason}`
  })
}

function cloneSnapshot(snapshot: CockpitSnapshot): CockpitSnapshot {
  return {
    ...snapshot,
    taskBoard: {
      global: cloneColumns(snapshot.taskBoard.global),
      projects: snapshot.taskBoard.projects.map((project) => ({
        ...project,
        columns: cloneColumns(project.columns),
      })),
    },
    activeRuns: snapshot.activeRuns.map((run) => ({ ...run })),
    blockers: snapshot.blockers.map((blocker) => ({ ...blocker })),
    artifacts: snapshot.artifacts.map((artifact) => ({ ...artifact })),
    reviewQueue: snapshot.reviewQueue.map((item) => ({ ...item })),
    mergeQueue: snapshot.mergeQueue.map((item) => ({ ...item })),
    policyDecisions: snapshot.policyDecisions.map((decision) => ({ ...decision })),
    adapterHealth: snapshot.adapterHealth.map((item) => ({ ...item })),
    events: snapshot.events.map((event) => ({ ...event, attributes: { ...(event.attributes ?? {}) } })),
  }
}

function cloneColumns(columns: BoardColumns): BoardColumns {
  return {
    open: columns.open.map((task) => ({ ...task, blockers: [...(task.blockers ?? [])] })),
    running: columns.running.map((task) => ({ ...task, blockers: [...(task.blockers ?? [])] })),
    blocked: columns.blocked.map((task) => ({ ...task, blockers: [...(task.blockers ?? [])] })),
    done: columns.done.map((task) => ({ ...task, blockers: [...(task.blockers ?? [])] })),
    failed: columns.failed.map((task) => ({ ...task, blockers: [...(task.blockers ?? [])] })),
  }
}

function applyEventToState(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  switch (event.kind) {
    case 'task.created':
      addTask(snapshot, event)
      break
    case 'run.started':
      upsertRun(snapshot, event, 'running')
      moveTask(snapshot, event.attributes?.task_id, 'running', { runId: event.subject })
      break
    case 'run.heartbeat':
      upsertRun(snapshot, event, 'running')
      break
    case 'run.blocked':
      upsertRun(snapshot, event, 'blocked')
      moveTask(snapshot, event.attributes?.task_id, 'blocked')
      addBlocker(snapshot, event)
      break
    case 'run.completed':
      completeRun(snapshot, event, 'done')
      break
    case 'run.failed':
      completeRun(snapshot, event, 'failed')
      break
    case 'artifact.created':
      upsertArtifact(snapshot, event)
      break
    case 'review.requested':
    case 'review.in_review':
    case 'review.approved':
    case 'review.changes_requested':
      upsertReview(snapshot, event)
      break
    case 'merge.ready':
    case 'merge.blocked':
    case 'merge.merged':
    case 'merge.failed':
      upsertMerge(snapshot, event)
      break
    case 'policy.decision':
      upsertPolicyDecision(snapshot, event)
      break
    case 'adapter.health_checked':
      upsertAdapterHealth(snapshot, event)
      break
  }
}

function addTask(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const attributes = event.attributes ?? {}
  const task: TaskCard = {
    id: event.subject,
    workspaceId: attributes.workspace_id ?? 'local',
    projectId: attributes.project_id ?? 'global',
    projectName: attributes.project_name ?? attributes.project_id ?? 'Global',
    title: attributes.title ?? event.message,
    status: parseTaskStatus(attributes.status),
  }
  upsertTask(snapshot, task)
}

function upsertTask(snapshot: CockpitSnapshot, task: TaskCard): void {
  removeTask(snapshot.taskBoard.global, task.id)
  snapshot.taskBoard.global[task.status].push(task)

  let project = snapshot.taskBoard.projects.find((item) => item.projectId === task.projectId)
  if (!project) {
    project = { projectId: task.projectId, projectName: task.projectName, columns: createEmptyBoardColumns() }
    snapshot.taskBoard.projects.push(project)
  }
  removeTask(project.columns, task.id)
  project.columns[task.status].push(task)
}

function removeTask(columns: BoardColumns, taskId: string): TaskCard | undefined {
  for (const status of TASK_STATUSES) {
    const index = columns[status].findIndex((task) => task.id === taskId)
    if (index >= 0) {
      const [removed] = columns[status].splice(index, 1)
      return removed
    }
  }
  return undefined
}

function moveTask(snapshot: CockpitSnapshot, taskId: string | undefined, status: TaskStatus, patch: Partial<TaskCard> = {}): void {
  if (!taskId) return
  const existing = findTask(snapshot.taskBoard.global, taskId)
  if (!existing) return
  upsertTask(snapshot, { ...existing, ...patch, status })
}

function findTask(columns: BoardColumns, taskId: string): TaskCard | undefined {
  for (const status of TASK_STATUSES) {
    const task = columns[status].find((item) => item.id === taskId)
    if (task) return task
  }
  return undefined
}

function upsertRun(snapshot: CockpitSnapshot, event: LiveEventDto, fallbackStatus: RunStatus): void {
  const attributes = event.attributes ?? {}
  const taskId = attributes.task_id ?? existingRun(snapshot, event.subject)?.taskId ?? ''
  const task = taskId ? findTask(snapshot.taskBoard.global, taskId) : undefined
  const status = parseRunStatus(attributes.status, fallbackStatus)
  const run: ActiveRun = {
    ...existingRun(snapshot, event.subject),
    id: event.subject,
    taskId,
    projectId: task?.projectId,
    taskTitle: task?.title,
    agentRole: attributes.agent_role ?? existingRun(snapshot, event.subject)?.agentRole ?? 'agent',
    status,
    startedAtMs: existingRun(snapshot, event.subject)?.startedAtMs ?? event.atMs,
    lastEventId: event.id,
    note: event.message,
    blockingReason: status === 'blocked' ? event.message : existingRun(snapshot, event.subject)?.blockingReason,
  }
  const index = snapshot.activeRuns.findIndex((item) => item.id === event.subject)
  if (index >= 0) snapshot.activeRuns[index] = run
  else snapshot.activeRuns.push(run)
}

function existingRun(snapshot: CockpitSnapshot, runId: string): ActiveRun | undefined {
  return snapshot.activeRuns.find((run) => run.id === runId)
}

function completeRun(snapshot: CockpitSnapshot, event: LiveEventDto, taskStatus: TaskStatus): void {
  const taskId = event.attributes?.task_id ?? existingRun(snapshot, event.subject)?.taskId
  moveTask(snapshot, taskId, taskStatus)
  snapshot.activeRuns = snapshot.activeRuns.filter((run) => run.id !== event.subject)
}

function addBlocker(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const taskId = event.attributes?.task_id
  const id = event.attributes?.blocker_id ?? `blocker:${event.subject}`
  const blocker: Blocker = {
    id,
    taskId,
    runId: event.subject,
    severity: parseSeverity(event.attributes?.severity),
    title: event.attributes?.title ?? 'Run blocked',
    detail: event.message,
    status: 'open',
  }
  const index = snapshot.blockers.findIndex((item) => item.id === id)
  if (index >= 0) snapshot.blockers[index] = blocker
  else snapshot.blockers.push(blocker)
}

function upsertArtifact(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const attributes = event.attributes ?? {}
  const artifact: Artifact = {
    id: event.subject,
    runId: attributes.run_id ?? event.subject,
    taskId: attributes.task_id,
    kind: attributes.kind ?? 'result',
    path: attributes.path ?? event.message,
    label: attributes.label,
    state: parseArtifactState(attributes.state),
  }
  upsertById(snapshot.artifacts, artifact)
}

function upsertReview(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const attributes = event.attributes ?? {}
  const item: ReviewQueueItem = {
    id: event.subject,
    taskId: attributes.task_id ?? event.subject,
    title: attributes.title ?? event.message,
    status: parseReviewStatus(event.kind, attributes.status),
    reviewer: attributes.reviewer,
    runId: attributes.run_id,
  }
  upsertById(snapshot.reviewQueue, item)
}

function upsertMerge(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const attributes = event.attributes ?? {}
  const item: MergeQueueItem = {
    id: event.subject,
    taskId: attributes.task_id ?? event.subject,
    title: attributes.title ?? event.message,
    status: parseMergeStatus(event.kind, attributes.status),
    target: attributes.target,
    reason: attributes.reason ?? event.message,
    runId: attributes.run_id,
  }
  upsertById(snapshot.mergeQueue, item)
}

function upsertPolicyDecision(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const attributes = event.attributes ?? {}
  const decision: PolicyDecision = {
    id: event.subject,
    subjectKind: attributes.subject_kind ?? 'run',
    subjectId: attributes.subject_id ?? event.subject,
    allowed: attributes.allowed === 'true',
    reason: attributes.reason ?? event.message,
    atMs: event.atMs,
  }
  upsertById(snapshot.policyDecisions, decision)
}

function upsertAdapterHealth(snapshot: CockpitSnapshot, event: LiveEventDto): void {
  const item: HealthItem = {
    key: event.subject,
    status: parseHealthStatus(event.attributes?.status),
    message: event.message,
    capability: event.attributes?.capability,
    boundary: event.attributes?.boundary,
    checkedAtMs: event.atMs,
  }
  upsertById(snapshot.adapterHealth, item, 'key')
}

function upsertById<T extends Record<string, unknown>>(items: T[], item: T, key = 'id'): void {
  const index = items.findIndex((existing) => existing[key] === item[key])
  if (index >= 0) items[index] = item
  else items.push(item)
}

function parseTaskStatus(status: string | undefined): TaskStatus {
  return TASK_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : 'open'
}

function decodeSseValue(value: string): string {
  return value
    .replace(/%3D/g, '=')
    .replace(/%0A/g, '\n')
    .replace(/%20/g, ' ')
    .replace(/%25/g, '%')
}

function parseRunStatus(status: string | undefined, fallback: RunStatus): RunStatus {
  if (status === 'queued' || status === 'running' || status === 'blocked' || status === 'completed' || status === 'canceled' || status === 'failed') return status
  return fallback
}

function parseSeverity(severity: string | undefined): Blocker['severity'] {
  if (severity === 'info' || severity === 'warning' || severity === 'critical') return severity
  return 'critical'
}

function parseArtifactState(state: string | undefined): ArtifactState {
  if (state === 'pending' || state === 'failed') return state
  return 'ready'
}

function parseHealthStatus(status: string | undefined): HealthStatus {
  if (status === 'available' || status === 'degraded' || status === 'missing') return status
  return 'missing'
}

function parseReviewStatus(kind: string, status: string | undefined): ReviewQueueItem['status'] {
  if (status === 'requested' || status === 'in_review' || status === 'approved' || status === 'changes_requested') return status
  return kind.replace('review.', '') as ReviewQueueItem['status']
}

function parseMergeStatus(kind: string, status: string | undefined): MergeQueueItem['status'] {
  if (status === 'ready' || status === 'blocked' || status === 'merged' || status === 'failed') return status
  return kind.replace('merge.', '') as MergeQueueItem['status']
}
