# Graph Report - fulcrum  (2026-05-06)

## Corpus Check
- 2293 files · ~1,381,749 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 9623 nodes · 22284 edges · 99 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 6571 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 127|Community 127]]
- [[_COMMUNITY_Community 128|Community 128]]
- [[_COMMUNITY_Community 129|Community 129]]
- [[_COMMUNITY_Community 130|Community 130]]
- [[_COMMUNITY_Community 131|Community 131]]
- [[_COMMUNITY_Community 132|Community 132]]
- [[_COMMUNITY_Community 133|Community 133]]
- [[_COMMUNITY_Community 134|Community 134]]
- [[_COMMUNITY_Community 135|Community 135]]
- [[_COMMUNITY_Community 159|Community 159]]
- [[_COMMUNITY_Community 188|Community 188]]

## God Nodes (most connected - your core abstractions)
1. `has()` - 154 edges
2. `load()` - 152 edges
3. `parse()` - 143 edges
4. `now()` - 127 edges
5. `runMigrations()` - 118 edges
6. `SymphonyElixir.StatusDashboard` - 110 edges
7. `newUlid()` - 105 edges
8. `openPglite()` - 97 edges
9. `SymphonyElixir.Orchestrator` - 91 edges
10. `execute()` - 77 edges

## Surprising Connections (you probably didn't know these)
- `testContainer()` --calls--> `registerDbBindings()`  [INFERRED]
  tests/tui/foundation.test.ts → src/db/db.module.ts
- `unauthenticatedContext()` --calls--> `createContext()`  [INFERRED]
  tests/trpc/app-router-scaffold.test.ts → src/trpc/context.ts
- `insertTask()` --calls--> `execute()`  [INFERRED]
  tests/trpc/reports-burndown.test.ts → src/server/trpc/routers/backup.ts
- `installP11SearchColumns()` --calls--> `execute()`  [INFERRED]
  tests/docs/search-indexer-hook.test.ts → src/server/trpc/routers/backup.ts
- `tempDir()` --calls--> `tmpDir()`  [INFERRED]
  tests/cli/codegen-gate.test.ts → src/backup/scheduled-backups.test.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (582): flag(), openProductDb(), run(), deriveCapabilities(), listProfiles(), maskProfile(), freshDb(), seedProfiles() (+574 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (310): Account, AccountRepository, AgentProfile, AgentProfileRepository, AgentRun, assertCliPathAllowed(), getAllowedCliPaths(), Artifact (+302 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (196): renderFocusableRow(), renderHighContrastLegend(), renderPlain(), ActivityFeedScreen, formatDate(), addText(), createFulcrumTuiRenderer(), createNullOutput() (+188 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (347): clearActiveProject(), getActiveProject(), isValidSlug(), setActiveProject(), createCookiesStub(), InMemoryStore, createHook(), createHook() (+339 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (384): FakeSkillRepo, expandProfile(), getComponent(), mcpComponent(), component(), vendorPackageComponent(), walk(), exists() (+376 more)

### Community 5 - "Community 5"
Cohesion: 0.01
Nodes (194): buildWhere(), MikroOrmBetterAuthAdapter, normalizeLocalAuthEmail(), AfterDocSaveMemoryHook, AfterRunMemoryHook, sourceRefFor(), setupProfile(), FakeTaskRepo (+186 more)

### Community 6 - "Community 6"
Cohesion: 0.01
Nodes (214): goto(), findEnabledForDispatch(), backendConfigured(), backendEnabled(), embeddedSocketPath(), fulcrumHome(), isFeatureEnabled(), parseFeatureFlags() (+206 more)

### Community 7 - "Community 7"
Cohesion: 0.01
Nodes (176): extractFrontmatter(), extractHeadingSections(), extractWikilinks(), parseArgs(), checkConnectorReachability(), checkConnectorRunHealth(), checkPendingDeliveryBacklog(), checkRestSurface() (+168 more)

### Community 8 - "Community 8"
Cohesion: 0.01
Nodes (133): SymphonyElixir.Linear.Adapter, client_module(), resolve_state_id(), compileClause(), compileCustomFieldOp(), compileSavedViewQuery(), compileSingleOp(), detectConfiguredBackends() (+125 more)

### Community 9 - "Community 9"
Cohesion: 0.01
Nodes (220): accountTokenKey(), decryptAccountToken(), encryptAccountToken(), EncryptedAccountTokenType, nonEmptyEnv(), dispatchToast(), hashToken(), blob_error() (+212 more)

### Community 10 - "Community 10"
Cohesion: 0.01
Nodes (181): createAgentRunsCommand(), createAgentsCommand(), runAgents(), runDoctorJson(), flagIso(), flagNumber(), flagString(), parseArgs() (+173 more)

### Community 11 - "Community 11"
Cohesion: 0.01
Nodes (214): callerFor(), mockSession(), getInvitationClass(), getInvitationRepository(), getOrgMemberClass(), getOrgMemberRepository(), getUserClass(), getUserRepository() (+206 more)

### Community 12 - "Community 12"
Cohesion: 0.01
Nodes (119): getRepoDashboard(), getRepoDetail(), requireDefaultService(), getDocumentVersion(), getNextVersionNumber(), legacyBody(), legacyToDocVersion(), legacyVersionsTableExists() (+111 more)

### Community 13 - "Community 13"
Cohesion: 0.02
Nodes (153): seedDefaultRules(), requeueDueNotificationDeliveries(), assertNotificationDeliveryPayload(), createNotificationDeliveryTask(), deliverNotification(), registerNotificationDeliveryWorkerTasks(), retryHeldQuietHoursDeliveries(), assertCanonicalEvent() (+145 more)

### Community 14 - "Community 14"
Cohesion: 0.01
Nodes (83): ArtifactsScreen, wikilinkTitles(), BackgroundSyncQueue, makeId(), MemoryStorage, goToNext(), goToPrevious(), makeCurrent() (+75 more)

### Community 15 - "Community 15"
Cohesion: 0.02
Nodes (161): buildDefaultApiDoctorConfig(), runHook(), runAudit(), packageParity(), getDefaultTargets(), parseArgs(), resolveAndFilterTargets(), resolveCavemanCompressDir() (+153 more)

### Community 16 - "Community 16"
Cohesion: 0.02
Nodes (130): AzureBackend, isRetryable(), withRetry(), server_port(), SymphonyElixir.ExtensionsTest, assert_eventually(), wait_for_bound_port(), StdoutOutput (+122 more)

### Community 17 - "Community 17"
Cohesion: 0.02
Nodes (94): extractKinds(), extractMimeTypes(), hashKey(), columnsForTable(), createDump(), decodeDump(), encodeDump(), quoteIdent() (+86 more)

### Community 18 - "Community 18"
Cohesion: 0.02
Nodes (126): SymphonyElixir.AgentRunner, build_turn_prompt(), codex_message_handler(), continue_with_issue?(), do_run_codex_turns(), issue_context(), run(), run_on_worker_host() (+118 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (73): withFulcrumHome(), deriveAutoSlug(), cloneUpstream(), enabledAgentsFor(), expandHome(), findSkillMarkdown(), findSkillMarkdownRecursive(), firstInstalledSkillPath() (+65 more)

### Community 20 - "Community 20"
Cohesion: 0.03
Nodes (78): authenticatedContext(), findMutationPermissionViolations(), findProtectedProcedurePermissionViolations(), mockSession(), sourceFiles(), unauthenticatedContext(), attestationOf(), compact() (+70 more)

### Community 21 - "Community 21"
Cohesion: 0.03
Nodes (63): resolveService(), attemptCountOf(), processCandidate(), reconcileRunningIssues(), tick(), validateRuntimeConfig(), EventBus, getEventBus() (+55 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (61): toRow(), __setWebRuntimeForTest(), resolveClientAssetPath(), makeLockEntry(), RepoRegistrationService, slugFromRemoteUrl(), ManualBackend, ManualHandle (+53 more)

### Community 23 - "Community 23"
Cohesion: 0.03
Nodes (29): CodexAppServerClient, fakeProcess(), notification(), tokenUsageNotification(), AppServerPolicyError, AppServerProtocolError, AppServerTimeoutError, extractThreadStatus() (+21 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (39): ArtifactRetentionPolicy, SymphonyElixirWeb.DashboardLive, completed_runtime_seconds(), handle_info(), load_payload(), mount(), orchestrator(), runtime_seconds_from_started_at() (+31 more)

### Community 25 - "Community 25"
Cohesion: 0.04
Nodes (48): createAuditPruneTask(), cutoffFor(), oldestCreatedAt(), pruneAuditEvents(), registerAuditPruneCron(), scopedOrgId(), sleep(), SlowOrchestrator (+40 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (58): assertCompletionScriptsNonEmpty(), bindingKey(), callName(), camel(), chainedCallArgument(), checkGeneratedSnapshot(), createExtractorContext(), emitDomain() (+50 more)

### Community 27 - "Community 27"
Cohesion: 0.05
Nodes (38): emitError(), positional(), run(), testProfile(), extractArtifacts(), listFilesRecursive(), matchArtifactGlob(), matchesAny() (+30 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (44): buildMeilisearchFilters(), clampLimit(), createSearchBackend(), escapeFilterValue(), isMeilisearchEnabled(), isRecord(), MeilisearchBackend, meilisearchConfig() (+36 more)

### Community 29 - "Community 29"
Cohesion: 0.05
Nodes (35): AgentRunRepository, arrayOfRecords(), arrayOfStrings(), assembleSkillContext(), clipToTokenBudget(), ContextAssembler, dateMillis(), docTitle() (+27 more)

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (36): assertMarketplaceEnabled(), base64urlToUint8Array(), buildSignedPayload(), FeatureDisabledError, fetchListing(), importEd25519PublicKey(), isMarketplaceEnabled(), SignatureVerificationError (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.05
Nodes (36): SymphonyElixir.CLI, acknowledgement_banner(), evaluate(), main(), maybe_set_logs_root(), maybe_set_server_port(), require_guardrails_acknowledgement(), run() (+28 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (19): i18nTabVisible(), renderI18nScreen(), selectLocale(), relativeTime(), renderStatusBar(), buildFilterChips(), executeSearch(), toggleSemanticMode() (+11 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (17): buildDoctorReport(), discoverChecks(), runOrchestrator(), pad(), printJsonReport(), statusIcon(), runChecks(), runOneCheck() (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (10): embedding(), averageLength(), compareHybridMatches(), compareNumberDesc(), compareRankedMatches(), compareStringAsc(), documentFrequenciesFor(), rankMemoryMatches() (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (12): authConfigSignature(), AuthService, betterAuthSecret(), buildAuth(), buildDbAdapterInstance(), isFlagEnabled(), isProductionRuntime(), nonEmptyEnv() (+4 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (18): booleanFlag(), compact(), flagValue(), flagValues(), formatEnrichedDecision(), numberFlag(), optionalJsonFlag(), parseJsonReference() (+10 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (7): routerUnreadCount(), calculateUnreadNotificationCount(), entities(), findOrgRef(), orgClass(), ruleTiming(), ruleToOutput()

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (3): destroy(), makeData(), pageData()

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (17): compact(), docLookup(), flagValue(), numberFlag(), parseCreateInput(), parseListInput(), printOutput(), requireArg() (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (7): buildMemoryListInput(), isMemoryImportance(), isMemoryKind(), isMemorySource(), normalizeMemoryConfig(), numberOrDefault(), parseTags()

### Community 44 - "Community 44"
Cohesion: 0.15
Nodes (2): makeSelect(), handleInputKeydown()

### Community 45 - "Community 45"
Cohesion: 0.3
Nodes (9): applyTemplateState(), chooseDocType(), currentTemplateState(), handleBodyChange(), handleKindChange(), applyTemplateSelectionChange(), buildDocTypeOptions(), createInitialTemplateState() (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.36
Nodes (6): evidenceFor(), files(), hasRedBeforeGreen(), phaseCommitRegex(), phaseDir(), readMatching()

### Community 51 - "Community 51"
Cohesion: 0.31
Nodes (4): checkFeatureFlag(), checkForUpdates(), copyArtifact(), getTauri()

### Community 55 - "Community 55"
Cohesion: 0.43
Nodes (5): SymphonyElixir.MixProject, aliases(), deps(), escript(), project()

### Community 56 - "Community 56"
Cohesion: 0.38
Nodes (4): SymphonyElixir.SSH, maybe_put_config(), maybe_put_port(), ssh_args()

### Community 57 - "Community 57"
Cohesion: 0.38
Nodes (4): applyThemeValues(), cssVarName(), resolveDocument(), useTheme()

### Community 60 - "Community 60"
Cohesion: 0.43
Nodes (1): ContextSummaryExtractor

### Community 62 - "Community 62"
Cohesion: 0.47
Nodes (3): extractMentionLabels(), extractPlainText(), extractWikilinkSlugs()

### Community 63 - "Community 63"
Cohesion: 0.47
Nodes (3): buildSshCommand(), dispatchSshWorker(), escapeShellArg()

### Community 65 - "Community 65"
Cohesion: 0.4
Nodes (1): SymphonyElixir.TestSupport.Snapshot

### Community 68 - "Community 68"
Cohesion: 0.5
Nodes (2): getInitialProjectView(), isProjectView()

### Community 70 - "Community 70"
Cohesion: 0.4
Nodes (1): YDocStub

### Community 72 - "Community 72"
Cohesion: 0.5
Nodes (1): Mix.Tasks.PrBody.CheckTest

### Community 73 - "Community 73"
Cohesion: 0.5
Nodes (1): Mix.Tasks.Specs.CheckTaskTest

### Community 74 - "Community 74"
Cohesion: 0.5
Nodes (1): SymphonyElixir.SpecsCheckTest

### Community 75 - "Community 75"
Cohesion: 0.5
Nodes (1): SymphonyElixir.CoreTest

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (2): guard(), setupKeyboardShortcuts()

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (2): fakeFail(), fakeOkFetch()

### Community 80 - "Community 80"
Cohesion: 0.5
Nodes (3): GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient

### Community 81 - "Community 81"
Cohesion: 0.5
Nodes (1): Migration20260505023000_agent_runs_app_server_ids

### Community 82 - "Community 82"
Cohesion: 0.5
Nodes (1): Migration20260502070600_agent_profiles

### Community 83 - "Community 83"
Cohesion: 0.5
Nodes (1): Migration20260506001

### Community 84 - "Community 84"
Cohesion: 0.5
Nodes (1): Migration20260502120000_webhooks

### Community 85 - "Community 85"
Cohesion: 0.5
Nodes (1): Migration20260503120000_doc_versions_yjs_state

### Community 86 - "Community 86"
Cohesion: 0.5
Nodes (1): Migration20260504120000_telemetry_outbox

### Community 87 - "Community 87"
Cohesion: 0.5
Nodes (1): Migration20260505010000_agent_runs_lifecycle_codex_columns

### Community 88 - "Community 88"
Cohesion: 0.5
Nodes (1): Migration20260507001

### Community 89 - "Community 89"
Cohesion: 0.5
Nodes (1): Migration20260502121100_task_dependencies_index

### Community 90 - "Community 90"
Cohesion: 0.5
Nodes (1): Migration20260505041000_routing_drafts

### Community 91 - "Community 91"
Cohesion: 0.5
Nodes (1): Migration20260502121200_task_tiptap_content

### Community 92 - "Community 92"
Cohesion: 0.5
Nodes (1): Migration20260502110400_metrics_cache

### Community 93 - "Community 93"
Cohesion: 0.5
Nodes (1): Migration20260502095400_custom_field_defs

### Community 94 - "Community 94"
Cohesion: 0.5
Nodes (1): Migration20260503140000_artifact_checksum_retention

### Community 95 - "Community 95"
Cohesion: 0.5
Nodes (1): Migration20260505100001_phase5_schema_new_tables

### Community 96 - "Community 96"
Cohesion: 0.5
Nodes (1): Migration20260505042000_skill_supply_chain

### Community 97 - "Community 97"
Cohesion: 0.5
Nodes (1): Migration20260502121000_task_crud_baseline

### Community 98 - "Community 98"
Cohesion: 0.5
Nodes (1): Migration20260502110500_connector_sync_log

### Community 99 - "Community 99"
Cohesion: 0.5
Nodes (1): Migration20260504130000_ddl_cleanup

### Community 100 - "Community 100"
Cohesion: 0.5
Nodes (1): Migration20260505100000_phase5_schema_extensions

### Community 101 - "Community 101"
Cohesion: 0.5
Nodes (1): Migration20260503130000_agent_runs_transcript_truncated

### Community 102 - "Community 102"
Cohesion: 0.5
Nodes (1): Migration20260502110300_notifications

### Community 103 - "Community 103"
Cohesion: 1.0
Nodes (2): runCli(), runInit()

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (1): SymphonyElixir.PathSafety

### Community 106 - "Community 106"
Cohesion: 0.67
Nodes (1): SymphonyElixir.Linear.Issue

### Community 107 - "Community 107"
Cohesion: 0.67
Nodes (1): SymphonyElixirWeb.ErrorJSON

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (1): SymphonyElixirWeb.ErrorHTML

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (1): SymphonyElixir.Codex.DynamicToolTest

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (1): SymphonyElixir.ObservabilityPubSubTest

### Community 129 - "Community 129"
Cohesion: 1.0
Nodes (1): SymphonyElixir.CLITest

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (1): SymphonyElixir.WorkspaceAndConfigTest

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (1): SymphonyElixir.AppServerTest

### Community 132 - "Community 132"
Cohesion: 1.0
Nodes (1): SymphonyElixir.LogFileTest

### Community 133 - "Community 133"
Cohesion: 1.0
Nodes (1): SymphonyElixirWeb.StaticAssets

### Community 134 - "Community 134"
Cohesion: 1.0
Nodes (1): SymphonyElixirWeb.Router

### Community 135 - "Community 135"
Cohesion: 1.0
Nodes (1): SymphonyElixirWeb.Endpoint

### Community 159 - "Community 159"
Cohesion: 1.0
Nodes (1): selected

### Community 188 - "Community 188"
Cohesion: 1.0
Nodes (1): TelemetryOutbox

## Knowledge Gaps
- **146 isolated node(s):** `CopyArtifactResult`, `UpdateCheckResult`, `FeatureFlagResult`, `Request`, `RpcError` (+141 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 44`** (13 nodes): `filterAndSort()`, `makeKeydownHandler()`, `makeSelect()`, `filterCommands()`, `handleInputKeydown()`, `selectCommand()`, `selectLegacyItem()`, `selectSearchHit()`, `command-palette-filter.ts`, `command-palette-handlers.ts`, `CommandPalette.svelte`, `cmdk-palette.test.ts`, `phase05-command-palette.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (7 nodes): `ContextSummaryExtractor`, `.extractHeadings()`, `.extractMentions()`, `.extractSummary()`, `.extractWikilinks()`, `context-summary-extractor.test.ts`, `context-summary-extractor.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (5 nodes): `SymphonyElixir.TestSupport.Snapshot`, `normalize_content()`, `snapshot_path()`, `update_snapshots?()`, `snapshot_support.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (5 nodes): `view-switcher.ts`, `getInitialProjectView()`, `isProjectView()`, `projectViewHref()`, `rememberProjectView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (5 nodes): `createCollabProviders()`, `YDocStub`, `.getXmlFragment()`, `collab-provider-factory.test.ts`, `collab-provider-factory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (4 nodes): `Mix.Tasks.PrBody.CheckTest`, `in_temp_repo()`, `write_template!()`, `pr_body_check_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (4 nodes): `Mix.Tasks.Specs.CheckTaskTest`, `in_temp_project()`, `write_module!()`, `specs_check_task_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (4 nodes): `SymphonyElixir.SpecsCheckTest`, `create_tmp_dir()`, `write_module!()`, `specs_check_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (4 nodes): `SymphonyElixir.CoreTest`, `assert_due_in_range()`, `restore_app_env()`, `core_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (4 nodes): `guard()`, `isEditableTarget()`, `setupKeyboardShortcuts()`, `KeyboardShortcuts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (4 nodes): `fakeFail()`, `fakeOkFetch()`, `page.server.test.ts`, `page.server.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (4 nodes): `Migration20260505023000_agent_runs_app_server_ids`, `.down()`, `.up()`, `Migration20260505023000_agent_runs_app_server_ids.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (4 nodes): `Migration20260502070600_agent_profiles`, `.down()`, `.up()`, `Migration20260502070600_agent_profiles.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (4 nodes): `Migration20260506001`, `.down()`, `.up()`, `Migration20260506001.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (4 nodes): `Migration20260502120000_webhooks`, `.down()`, `.up()`, `Migration20260502120000_webhooks.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (4 nodes): `Migration20260503120000_doc_versions_yjs_state`, `.down()`, `.up()`, `Migration20260503120000_doc_versions_yjs_state.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (4 nodes): `Migration20260504120000_telemetry_outbox`, `.down()`, `.up()`, `Migration20260504120000_telemetry_outbox.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (4 nodes): `Migration20260505010000_agent_runs_lifecycle_codex_columns`, `.down()`, `.up()`, `Migration20260505010000_agent_runs_lifecycle_codex_columns.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (4 nodes): `Migration20260507001`, `.down()`, `.up()`, `Migration20260507001.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (4 nodes): `Migration20260502121100_task_dependencies_index`, `.down()`, `.up()`, `Migration20260502121100_task_dependencies_index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (4 nodes): `Migration20260505041000_routing_drafts`, `.down()`, `.up()`, `Migration20260505041000_routing_drafts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (4 nodes): `Migration20260502121200_task_tiptap_content`, `.down()`, `.up()`, `Migration20260502121200_task_tiptap_content.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (4 nodes): `Migration20260502110400_metrics_cache`, `.down()`, `.up()`, `Migration20260502110400_metrics_cache.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (4 nodes): `Migration20260502095400_custom_field_defs`, `.down()`, `.up()`, `Migration20260502095400_custom_field_defs.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (4 nodes): `Migration20260503140000_artifact_checksum_retention`, `.down()`, `.up()`, `Migration20260503140000_artifact_checksum_retention.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (4 nodes): `Migration20260505100001_phase5_schema_new_tables`, `.down()`, `.up()`, `Migration20260505100001_phase5_schema_new_tables.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 96`** (4 nodes): `Migration20260505042000_skill_supply_chain`, `.down()`, `.up()`, `Migration20260505042000_skill_supply_chain.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (4 nodes): `Migration20260502121000_task_crud_baseline`, `.down()`, `.up()`, `Migration20260502121000_task_crud_baseline.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 98`** (4 nodes): `Migration20260502110500_connector_sync_log`, `.down()`, `.up()`, `Migration20260502110500_connector_sync_log.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (4 nodes): `Migration20260504130000_ddl_cleanup`, `.down()`, `.up()`, `Migration20260504130000_ddl_cleanup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (4 nodes): `Migration20260505100000_phase5_schema_extensions`, `.down()`, `.up()`, `Migration20260505100000_phase5_schema_extensions.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 101`** (4 nodes): `Migration20260503130000_agent_runs_transcript_truncated`, `.down()`, `.up()`, `Migration20260503130000_agent_runs_transcript_truncated.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (4 nodes): `Migration20260502110300_notifications`, `.down()`, `.up()`, `Migration20260502110300_notifications.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (3 nodes): `runCli()`, `runInit()`, `init.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (3 nodes): `SymphonyElixir.PathSafety`, `resolve_segments()`, `path_safety.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (3 nodes): `SymphonyElixir.Linear.Issue`, `label_names()`, `issue.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (3 nodes): `SymphonyElixirWeb.ErrorJSON`, `render()`, `error_json.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (3 nodes): `SymphonyElixirWeb.ErrorHTML`, `render()`, `error_html.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (2 nodes): `SymphonyElixir.Codex.DynamicToolTest`, `dynamic_tool_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (2 nodes): `SymphonyElixir.ObservabilityPubSubTest`, `observability_pubsub_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 129`** (2 nodes): `SymphonyElixir.CLITest`, `cli_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (2 nodes): `workspace_and_config_test.exs`, `SymphonyElixir.WorkspaceAndConfigTest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (2 nodes): `SymphonyElixir.AppServerTest`, `app_server_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 132`** (2 nodes): `SymphonyElixir.LogFileTest`, `log_file_test.exs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 133`** (2 nodes): `SymphonyElixirWeb.StaticAssets`, `static_assets.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 134`** (2 nodes): `SymphonyElixirWeb.Router`, `router.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 135`** (2 nodes): `SymphonyElixirWeb.Endpoint`, `endpoint.ex`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 159`** (2 nodes): `selected`, `MentionSuggestion.svelte`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 188`** (2 nodes): `TelemetryOutbox.ts`, `TelemetryOutbox`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `has()` connect `Community 10` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 27`, `Community 28`, `Community 32`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `now()` connect `Community 11` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 25`, `Community 27`, `Community 31`, `Community 32`, `Community 33`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `parse()` connect `Community 6` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 25`, `Community 27`, `Community 28`, `Community 29`, `Community 31`, `Community 33`, `Community 36`, `Community 37`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 144 inferred relationships involving `has()` (e.g. with `findMutationPermissionViolations()` and `runHook()`) actually correct?**
  _`has()` has 144 INFERRED edges - model-reasoned connections that need verification._
- **Are the 43 inferred relationships involving `load()` (e.g. with `current()` and `force_reload()`) actually correct?**
  _`load()` has 43 INFERRED edges - model-reasoned connections that need verification._
- **Are the 140 inferred relationships involving `parse()` (e.g. with `runSeedTwice()` and `packageDependencies()`) actually correct?**
  _`parse()` has 140 INFERRED edges - model-reasoned connections that need verification._
- **Are the 123 inferred relationships involving `now()` (e.g. with `waitFor()` and `mockSession()`) actually correct?**
  _`now()` has 123 INFERRED edges - model-reasoned connections that need verification._