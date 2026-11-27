import { randomUUID } from "node:crypto";
import type { WebDependencies } from "../src/core/clients/web/index.ts";
type MediaAdmin = NonNullable<WebDependencies["media"]>;
/** Independent state for each browser test's household settings. */
export function mediaSettingsScenario(): MediaAdmin {
  const choices = new Map<string, Awaited<ReturnType<MediaAdmin["camera"]>>>();
  const locations = [
    {
      location_id: "home",
      name: "Pilot household",
      ownership: "shared" as const,
      time_zone: "UTC",
      as_of: 0,
      state_version: 1,
    },
  ];
  const cameras = ["Front door", "Garden"].map((name, i) => ({
    device_id: String(i),
    location_id: "home",
    name,
    type: "camera" as const,
    power_mode: "wired" as const,
    online: true,
    state: {},
    as_of: 0,
    state_version: 2 + i,
  }));
  const receivers = ["receiver", "second-receiver"].map((id) => ({
    client_id: id,
    platform: "Test receiver",
    scopes: ["media" as const],
    redirect_uris: [],
  }));
  return {
    options: () =>
      Promise.resolve({
        locations,
        cameras,
        receivers,
        agents: receivers,
        denials: [],
        sharedPersonEventsAllowed: true,
      }),
    camera: (_home, id) => {
      const current = choices.get(id);
      return Promise.resolve(
        current ?? {
          enabled: false,
          sound: true,
          generation: "preview",
          approvalRevision: "",
          approvals: new Map<string, string>(),
        },
      );
    },
    save: (_home, device, receiver, change) => {
      const current = choices.get(device);
      let approvalRevision = current?.approvalRevision ?? "";
      if (
        change.expected &&
        change.expected.approvalRevision !== approvalRevision
      )
        return Promise.resolve("stale");
      const approvals = new Map(current?.approvals);
      for (const removed of change.remove ?? []) {
        if (approvals.delete(removed)) approvalRevision = randomUUID();
      }
      if (receiver && change.approved && !approvals.has(receiver)) {
        approvalRevision = randomUUID();
        approvals.set(receiver, approvalRevision);
      }
      choices.set(device, {
        ...change,
        generation: "preview",
        approvalRevision,
        approvals,
      });
      return Promise.resolve("saved");
    },
  };
}
