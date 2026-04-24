use fulcrum_actions::ActionOrchestrator;

#[test]
fn windmill_actions_are_operator_actions_not_agent_run_state() {
    let mut orchestrator = ActionOrchestrator::new();

    let request =
        orchestrator.request_human_action("windmill", "refresh-project-report", "task_000001");

    assert_eq!(request.adapter_key, "windmill");
    assert_eq!(request.fulcrum_ref, "task_000001");
    assert_eq!(orchestrator.requests().len(), 1);
    assert_eq!(orchestrator.events()[0].subject, "act_000001");
}
