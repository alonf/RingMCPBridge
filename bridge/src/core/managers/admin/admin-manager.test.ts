// Admin's connector part (T017) over a real Settings on SQLite: it passes the key check and the
// enroll request through, and turns Settings' failures into its own.
import { describe, expect, it } from "vitest";
import { SettingsStore } from "../../access/settings/index.ts";
import { FakeClock } from "../../../utilities/clock/index.ts";
import {
  CORE_MIGRATIONS,
  openSqliteQueryLayer,
  runMigrations,
} from "../../../utilities/query-layer/index.ts";
import type { QueryLayer } from "../../../utilities/query-layer/index.ts";
import {
  generateSigningKeyPair,
  signingKeyId,
} from "../../../utilities/security/index.ts";
import { AdminError, AdminManager } from "./index.ts";

const START = Date.UTC(2026, 10, 7, 9, 0, 0);

function never(): AbortSignal {
  return new AbortController().signal;
}

async function setUp(): Promise<{ admin: AdminManager; layer: QueryLayer }> {
  const clock = new FakeClock(START);
  const layer = openSqliteQueryLayer(":memory:", { clock });
  await runMigrations(layer, CORE_MIGRATIONS, { clock }, never());
  const settings = new SettingsStore({
    store: layer,
    clock,
    defaultBatteryThresholdPct: 20,
  });
  return { admin: new AdminManager({ settings }), layer };
}

describe("Admin, the connector's part", () => {
  it("records an enroll request and reports the key it names", async () => {
    const { admin } = await setUp();
    const { publicKey } = await generateSigningKeyPair();
    const keyId = signingKeyId(publicKey);

    await expect(
      admin.requestEnrollment({ public_key: publicKey, code: "AAAA" }, never()),
    ).resolves.toMatchObject({ kind: "pending", key_id: keyId });
    await expect(admin.connectorKey(keyId, never())).resolves.toEqual({
      kind: "not_enrolled",
    });
  });

  it("turns a database it cannot reach into its own unavailable, keeping the cause", async () => {
    const { admin, layer } = await setUp();
    const { publicKey } = await generateSigningKeyPair();
    await layer.close();

    for (const work of [
      () => admin.connectorKey("key", never()),
      () =>
        admin.requestEnrollment({ public_key: publicKey, code: "A" }, never()),
    ]) {
      const error = await work().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AdminError);
      expect(error).toMatchObject({
        kind: "unavailable",
        cause: { kind: "unavailable" },
      });
    }
  });

  it("lets an abort and a misuse through unchanged", async () => {
    const { admin } = await setUp();
    const { publicKey } = await generateSigningKeyPair();
    const controller = new AbortController();
    const reason = new Error("caller left");
    controller.abort(reason);

    await expect(admin.connectorKey("key", controller.signal)).rejects.toBe(
      reason,
    );
    await expect(
      admin.requestEnrollment({ public_key: publicKey, code: "" }, never()),
    ).rejects.toThrow(RangeError);
  });
});
