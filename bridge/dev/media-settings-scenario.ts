import type { WebDependencies } from "../src/core/clients/web/index.ts";
type MediaAdmin = NonNullable<WebDependencies["media"]>;
/** Independent state for each browser test's household settings. */
export function mediaSettingsScenario(): MediaAdmin {
  const choices = new Map<
    string,
    { enabled: boolean; sound: boolean; approved: boolean }
  >();
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
  const receivers = [
    {
      client_id: "receiver",
      platform: "Test receiver",
      scopes: ["media" as const],
      redirect_uris: [],
    },
  ];
  return {
    options: () => Promise.resolve({ locations, cameras, receivers }),
    camera: (_home, id) => {
      const current = choices.get(id);
      return Promise.resolve({
        enabled: current?.enabled ?? false,
        sound: current?.sound ?? true,
        generation: "preview",
        approvals: current?.approved
          ? new Map([["receiver", "preview"]])
          : new Map<string, string>(),
      });
    },
    save: (_home, device, _receiver, change) => {
      choices.set(device, change);
      return Promise.resolve();
    },
  };
}
