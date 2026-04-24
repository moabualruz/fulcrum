import { useEffect, useState } from "react";
import { PrivacyStatus } from "../components/privacy-status.js";

interface Capability {
  capabilityId: string;
  state: string;
  nextAction?: string;
}

const fallbackCapabilities: Capability[] = [
  { capabilityId: "cap_local_state", state: "guided", nextAction: "Run setup apply" },
  { capabilityId: "cap_network", state: "disabled", nextAction: "Remote checks skipped" }
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
        <h2>Capabilities</h2>
        <ul>
          {capabilities.map((capability) => (
            <li key={capability.capabilityId}>
              <strong>{capability.capabilityId}</strong>
              <span>{capability.state}</span>
              <span>{capability.nextAction}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
