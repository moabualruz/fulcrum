/**
 * Pure logic for the TUI agents pane.
 * Renders a profile table and maps keypresses to actions.
 */

export interface ProfileTableRow {
  id: string;
  name: string;
  cliPath: string;
  lastTestedAt: string | null;
  testPassed: boolean | null;
}

export interface AgentsPaneState {
  profiles: ProfileTableRow[];
  selectedIndex: number;
}

export type AgentsPaneAction =
  | { type: "testProfile"; profileId: string }
  | { type: "editProfile"; profileId: string }
  | { type: "openRunHistory"; profileId: string; agentName: string }
  | { type: "navigate"; selectedIndex: number };

export function profileTableRows(profiles: ProfileTableRow[]): ProfileTableRow[] {
  return profiles;
}

export function initialAgentsPaneState(profiles: ProfileTableRow[]): AgentsPaneState {
  return { profiles, selectedIndex: 0 };
}

export function handleAgentsPaneKey(
  state: AgentsPaneState,
  key: string,
): AgentsPaneAction | null {
  const selected = state.profiles[state.selectedIndex];
  if (!selected) return null;

  switch (key) {
    case "t":
      return { type: "testProfile", profileId: selected.id };
    case "e":
      return { type: "editProfile", profileId: selected.id };
    case "Enter":
      return {
        type: "openRunHistory",
        profileId: selected.id,
        agentName: selected.name,
      };
    case "j": {
      const next = Math.min(state.selectedIndex + 1, state.profiles.length - 1);
      return { type: "navigate", selectedIndex: next };
    }
    case "k": {
      const prev = Math.max(state.selectedIndex - 1, 0);
      return { type: "navigate", selectedIndex: prev };
    }
    default:
      return null;
  }
}
