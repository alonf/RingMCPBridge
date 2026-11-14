// The core's read side for the MCP Endpoint's tests (T024): the 100-device standard home in State on
// SQLite, a fresh heartbeat, and a real Inquiry manager over them. The stdio fixture builds the same
// in its own process.
import { SettingsStore } from "../../src/core/access/settings/index.ts";
import { StateStore } from "../../src/core/access/state/index.ts";
import {
  afterHeartbeat,
  afterRefresh,
  afterSessionOpened,
} from "../../src/core/engines/health/index.ts";
import { InquiryManager } from "../../src/core/managers/inquiry/index.ts";
import type { Clock } from "../../src/utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../src/utilities/query-layer/index.ts";
import { standardHome } from "../scenarios/index.ts";

/** When the home's data was true, and its last heartbeat. */
export const HOME_AS_OF = Date.UTC(2026, 10, 9, 9, 0, 0);
const OFFLINE_AFTER_MS = 120_000;
const BATTERY_THRESHOLD_PCT = 20;

/** A core's read side over the standard home. */
export interface CoreReads {
  readonly inquiry: InquiryManager;
  close(): Promise<void>;
}

/** Stores the standard home and a heartbeat at `HOME_AS_OF`, and builds Inquiry over them. */
export async function startCoreReads(clock: Clock): Promise<CoreReads> {
  const never = new AbortController().signal;
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never);
  const state = new StateStore({ store: layer });
  const settings = new SettingsStore({
    store: layer,
    clock,
    defaultBatteryThresholdPct: BATTERY_THRESHOLD_PCT,
  });
  const home = standardHome();
  await state.applyInventory(
    {
      snapshot_version: 0,
      locations: home.locations.map((location) => ({
        ...location,
        as_of: HOME_AS_OF,
        state_version: 1,
      })),
      devices: home.devices.map((device, index) => ({
        ...device,
        as_of: HOME_AS_OF,
        state_version: index + 2,
      })),
    },
    never,
  );
  await state.saveHealth(
    afterHeartbeat(
      afterRefresh(afterSessionOpened(undefined, "0.1.0", HOME_AS_OF)),
      { ring_session: "ok", outbox_depth: 0, inventory_owed: false },
      HOME_AS_OF,
    ),
    never,
  );
  return {
    inquiry: new InquiryManager({
      state,
      settings,
      clock,
      homeOfflineAfterMs: OFFLINE_AFTER_MS,
    }),
    close: () => layer.close(),
  };
}
