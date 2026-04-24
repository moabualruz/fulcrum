# Cockpit Spike

The cockpit is the owned operator interface for global and per-project agent work.

This spike keeps UI code minimal and puts the live-state contract in
`crates/fulcrum-desktop`. TypeScript remains the intended cockpit implementation
language, while Rust owns the local daemon and snapshot source.

Validation gates:

- board can show global and per-project tasks
- active run updates are visible
- adapter health is visible
- event stream remains Fulcrum-owned
- Plane integration stays optional until local footprint and customizability pass
