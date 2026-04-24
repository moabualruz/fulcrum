import type { QualityGateDefinition, QualityGateResult } from "@fulcrum/shared";

interface QualityGatesProps {
  gates: QualityGateDefinition[];
  results: QualityGateResult[];
}

export function QualityGates({ gates, results }: QualityGatesProps) {
  return (
    <section className="quality-gates" aria-label="Quality gates">
      <header>
        <h2>Quality Gates</h2>
        <span>{gates.filter((gate) => gate.required).length} required</span>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">Gate</th>
            <th scope="col">Required</th>
            <th scope="col">Latest</th>
            <th scope="col">Artifact</th>
          </tr>
        </thead>
        <tbody>
          {gates.map((gate) => {
            const latest = results
              .filter((result) => result.gateId === gate.gateId)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
            return (
              <tr key={gate.gateId}>
                <th scope="row">{gate.name}</th>
                <td>{gate.required ? "required" : "optional"}</td>
                <td>{latest?.status ?? "not_run"}</td>
                <td>{latest?.outputArtifactId ?? "none"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
