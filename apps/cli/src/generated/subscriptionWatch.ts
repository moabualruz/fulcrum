import {
  createSubscriptionEventApiCallerFromEnv,
  type SubscriptionEventStreamInput,
} from "@platform-core/interface/http/subscription-event-api-client.ts";

type SubscriptionCaller = (input: SubscriptionEventStreamInput & { runId?: string }) => Promise<void>;

export async function runGeneratedSubscriptionWatch(input: {
  procedurePath: string;
  args?: Record<string, string | undefined>;
}): Promise<void> {
  const caller = createSubscriptionEventApiCallerFromEnv();
  if (!caller) {
    throw new Error(`Generated tRPC subscription for ${input.procedurePath} requires FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.`);
  }

  const subscription = resolveSubscriptionCaller(caller, input.procedurePath);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  try {
    const args = Object.fromEntries(
      Object.entries(input.args ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    await subscription({
      ...args,
      signal: controller.signal,
      onEvent(event) {
        console.log(JSON.stringify(event));
      },
    });
  } finally {
    process.off("SIGINT", stop);
  }
}

function resolveSubscriptionCaller(caller: ReturnType<typeof createSubscriptionEventApiCallerFromEnv>, procedurePath: string): SubscriptionCaller {
  if (!caller) throw new Error(`Generated tRPC subscription for ${procedurePath} requires an explicit surface adapter.`);
  switch (procedurePath) {
    case "runsSubscriptions.onRunUpdate":
      return caller.runsSubscriptions.onRunUpdate as unknown as SubscriptionCaller;
    case "notifySubscriptions.onNewNotification":
      return caller.notifySubscriptions.onNewNotification as SubscriptionCaller;
    case "orchestrationSubscriptions.onStateChange":
      return caller.orchestrationSubscriptions.onStateChange as SubscriptionCaller;
    default:
      throw new Error(`Generated tRPC subscription for ${procedurePath} requires an explicit surface adapter.`);
  }
}
