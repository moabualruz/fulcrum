use fulcrum_policy::evaluate_run_transition;

#[test]
fn run_transition_policy_blocks_terminal_mutation() {
    assert!(evaluate_run_transition("running", "completed").allowed);
    assert!(evaluate_run_transition("running", "canceled").allowed);
    assert!(!evaluate_run_transition("completed", "running").allowed);
    assert!(!evaluate_run_transition("failed", "completed").allowed);
}
