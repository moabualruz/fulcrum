#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GraphRef {
    pub kind: String,
    pub id: String,
}

impl GraphRef {
    pub fn new(kind: impl Into<String>, id: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GraphEdge {
    pub from: GraphRef,
    pub relation: String,
    pub to: GraphRef,
}

#[derive(Debug, Default, Clone)]
pub struct OsGraph {
    edges: Vec<GraphEdge>,
}

impl OsGraph {
    pub fn new() -> Self {
        Self { edges: Vec::new() }
    }

    pub fn link(&mut self, from: GraphRef, relation: impl Into<String>, to: GraphRef) {
        let edge = GraphEdge {
            from,
            relation: relation.into(),
            to,
        };
        if !self.edges.contains(&edge) {
            self.edges.push(edge);
        }
    }

    pub fn edges(&self) -> &[GraphEdge] {
        &self.edges
    }

    pub fn edges_from(&self, from: &GraphRef) -> Vec<&GraphEdge> {
        self.edges
            .iter()
            .filter(|edge| &edge.from == from)
            .collect()
    }

    pub fn edges_to(&self, to: &GraphRef) -> Vec<&GraphEdge> {
        self.edges.iter().filter(|edge| &edge.to == to).collect()
    }

    pub fn remove_edges_touching(&mut self, node: &GraphRef) {
        self.edges
            .retain(|edge| &edge.from != node && &edge.to != node);
    }

    pub fn has_link(&self, from: &GraphRef, relation: &str, to: &GraphRef) -> bool {
        self.edges
            .iter()
            .any(|edge| &edge.from == from && edge.relation == relation && &edge.to == to)
    }
}
