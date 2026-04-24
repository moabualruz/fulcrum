use fulcrum_graph::{GraphRef, OsGraph};

#[test]
fn links_memory_code_and_task_refs() {
    let mut graph = OsGraph::new();
    let memory = GraphRef::new("memory", "l0_000001");
    let task = GraphRef::new("task", "task_000001");
    let symbol = GraphRef::new("symbol", "sym_000001");

    graph.link(memory.clone(), "mentions", symbol.clone());
    graph.link(task.clone(), "uses_context", memory.clone());

    assert!(graph.has_link(&memory, "mentions", &symbol));
    assert!(graph.has_link(&task, "uses_context", &memory));
}

#[test]
fn removes_edges_touching_deleted_refs() {
    let mut graph = OsGraph::new();
    let file = GraphRef::new("file", "src/lib.rs");
    let symbol = GraphRef::new("symbol", "parse");

    graph.link(file.clone(), "declares", symbol.clone());
    graph.remove_edges_touching(&file);

    assert!(graph.edges().is_empty());
}
