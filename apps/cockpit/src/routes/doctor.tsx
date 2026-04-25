import { useEffect, useState } from "react";
import { PrivacyStatus } from "../components/privacy-status.js";

interface Capability {
  capabilityId: string;
  state: string;
  blocking?: boolean;
  privacyStatus?: string;
  affectedWorkflows?: string[];
  freshness?: string;
  nextAction?: string;
}

const fallbackCapabilities: Capability[] = [
  {
    capabilityId: "cap_doctor_api",
    state: "degraded",
    blocking: true,
    privacyStatus: "local_only",
    affectedWorkflows: ["doctor"],
    nextAction: "Start the Fulcrum server and retry doctor."
  }
];

export function DoctorRoute() {
  const [capabilities, setCapabilities] = useState<Capability[]>(fallbackCapabilities);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/doctor?noNetwork=true")
      .then((response) => response.json())
      .then((response: { data?: { capabilities?: Capability[] } }) => {
        if (active && response.data?.capabilities) {
          setCapabilities(response.data.capabilities);
        }
      })
      .catch(() => {
        setCapabilities(fallbackCapabilities);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Doctor</h1>
      <PrivacyStatus />
      <section aria-label="Capability health">
        <h2>Capability Matrix</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">State</th>
              <th scope="col">Blocking</th>
              <th scope="col">Privacy</th>
              <th scope="col">Workflows</th>
              <th scope="col">Freshness</th>
              <th scope="col">Next action</th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.capabilityId}>
                <th scope="row">{capability.capabilityId}</th>
                <td>{capability.state}</td>
                <td>{capability.blocking ? "yes" : "no"}</td>
                <td>{capability.privacyStatus ?? "local_only"}</td>
                <td>{capability.affectedWorkflows?.join(", ") ?? "doctor"}</td>
                <td>{capability.freshness ?? "unknown"}</td>
                <td>{capability.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
