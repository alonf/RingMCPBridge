import { readFile } from "node:fs/promises";
import { MediaRepresentationUnavailable } from "../../access/media/index.ts";
import type {
  EventMedia,
  EventMediaKey,
  MediaContent,
  MediaItem,
  MediaTickets,
} from "../../access/media/index.ts";
import type {
  ListedAgent,
  MediaPermissions,
  CameraChange,
  SettingsStore,
} from "../../access/settings/index.ts";
import type { StateStore } from "../../access/state/index.ts";
import { untilAborted } from "../../../utilities/query-layer/index.ts";

export interface ShareRequest {
  location_id: string;
  device_id: string;
  event_id: string;
  receiver_id: string;
  kind: "photo" | "clip";
}
/** An event source must resolve the exact source tuple and sound policy; it supplies no public download URL. */
export type EventMediaSource = (
  key: Omit<EventMediaKey, "capturedAt">,
  signal: AbortSignal,
) => Promise<
  | { status: "pending" | "missing" }
  | {
      status: "available";
      capturedAt: number;
      load: (signal: AbortSignal) => Promise<MediaContent>;
    }
>;
const MAX_INLINE_PHOTO_BYTES = 1024 * 1024;
const denialReasons = {
  item_unavailable: "The event media item is no longer available.",
  item_grant_invalid: "The item grant expired or no longer matches.",
  recorded_sound_disabled: "Recorded sound is disabled for this camera.",
  household_unknown: "Household is unknown.",
  camera_unknown: "Camera is unknown.",
  device_not_camera: "Device is not a camera or doorbell.",
  household_mismatch: "Camera belongs to another household.",
  receiver_unknown: "Receiving service is not registered.",
  receiver_revoked: "Receiving service was revoked.",
  receiver_missing_media: "Receiving service is not listed for media.",
  camera_disabled: "Media is disabled for this camera.",
  approval_missing: "No saved approval for this camera and service.",
  approval_changed: "Permission changed during the handoff.",
} as const;
type DenialReason = keyof typeof denialReasons;
export class MediaDenied extends Error {
  readonly reason: DenialReason | undefined;
  constructor(message?: string, reason?: DenialReason) {
    super(message);
    this.reason = reason;
  }
}
function denied(reason: DenialReason) {
  return new MediaDenied(denialReasons[reason], reason);
}
function receiverReason(
  agent: ListedAgent | undefined,
): DenialReason | undefined {
  if (!agent) return "receiver_unknown";
  if (agent.revoked_at !== undefined) return "receiver_revoked";
  if (!agent.scopes.includes("media")) return "receiver_missing_media";
  return undefined;
}
function cameraReason(
  enabled: boolean,
  approved: boolean,
): DenialReason | undefined {
  if (!enabled) return "camera_disabled";
  if (!approved) return "approval_missing";
  return undefined;
}

export class MediaSettingsUnavailable extends Error {}
interface Dependencies {
  lifetime: {
    readonly signal: AbortSignal;
    track<T>(work: Promise<T>): Promise<T>;
  };
  media: EventMedia;
  permissions: MediaPermissions;
  tickets: MediaTickets;
  state: StateStore;
  settings: SettingsStore;
  source?: EventMediaSource;
  sharedPersonEventsAllowed: boolean;
  publicUrl: string;
  eventMatches: (
    home: string,
    camera: string,
    event: string,
    signal: AbortSignal,
  ) => Promise<boolean>;
}
function isCamera(type: string) {
  return type === "camera" || type === "doorbell";
}
export function effectiveReceiverAccess(
  agent: ListedAgent | undefined,
  enabled: boolean,
  approved: boolean,
) {
  const reason = receiverReason(agent) ?? cameraReason(enabled, approved);
  return reason ? denialReasons[reason] : undefined;
}
/** Coordinates the same owner policy for issuance, cached hits and each receiver read. */
export class MediaHandoff {
  private readonly deps: Dependencies;
  private readonly preparing = new Set<string>();
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  async options(signal: AbortSignal) {
    const { state, settings } = this.deps;
    const [locations, devices, agents, denials] = await Promise.all([
      state.locations(signal),
      state.devices({}, signal),
      settings.agents(signal),
      this.deps.tickets.recentShareDenials(signal),
    ]);
    return {
      sharedPersonEventsAllowed: this.deps.sharedPersonEventsAllowed,
      locations,
      denials,
      agents,
      cameras: devices.filter((d) => isCamera(d.type)),
      receivers: agents.filter(
        (a) => a.revoked_at === undefined && a.scopes.includes("media"),
      ),
    };
  }
  camera(home: string, device: string, signal: AbortSignal) {
    return this.deps.permissions.camera(home, device, signal);
  }
  async save(
    home: string,
    device: string,
    receiver: string,
    change: CameraChange,
    signal: AbortSignal,
  ) {
    try {
      const location = await this.checkCamera(home, device, signal);
      if (
        location.ownership === "shared" &&
        !this.deps.sharedPersonEventsAllowed &&
        (change.personAction === "push" || change.personAction === "store_only")
      ) {
        throw new MediaDenied(
          "The shared-household deployment setting blocks person detections.",
        );
      }
      if (change.approved && receiver)
        await this.checkReceiver(receiver, signal);
      if (change.receivers !== undefined) {
        const current = await this.camera(home, device, signal);
        const desired = new Set(change.receivers);
        const add = [...desired].filter((id) => !current.approvals.has(id));
        const remove = [...current.approvals.keys()].filter(
          (id) => !desired.has(id),
        );
        await Promise.all(add.map((id) => this.checkReceiver(id, signal)));
        change = { ...change, add, remove };
      }
    } catch (cause) {
      if (cause instanceof MediaDenied) throw cause;
      throw new MediaSettingsUnavailable(
        "The camera settings could not be checked.",
        { cause },
      );
    }
    return this.deps.permissions.save(home, device, receiver, change, signal);
  }
  private async checkCamera(home: string, device: string, signal: AbortSignal) {
    const [location, camera] = await Promise.all([
      this.deps.state.location(home, signal),
      this.deps.state.device(device, signal),
    ]);
    if (!location) throw denied("household_unknown");
    if (!camera) throw denied("camera_unknown");
    if (!isCamera(camera.type)) throw denied("device_not_camera");
    if (camera.location_id !== home) throw denied("household_mismatch");
    return location;
  }
  private async checkReceiver(receiver: string, signal: AbortSignal) {
    const agent = await this.deps.settings.agent(receiver, signal);
    const reason = receiverReason(agent);
    if (reason) throw denied(reason);
  }
  private async access(
    home: string,
    device: string,
    receiver: string,
    signal: AbortSignal,
  ) {
    const [location, policy] = await Promise.all([
      this.checkCamera(home, device, signal),
      this.camera(home, device, signal),
      this.checkReceiver(receiver, signal),
    ]);
    const approval = policy.approvals.get(receiver);
    if (!policy.enabled) throw denied("camera_disabled");
    if (!approval) throw denied("approval_missing");
    return { policy, approval, zone: location.time_zone };
  }
  async testImage(
    home: string,
    camera: string,
    receiver: string,
    signal: AbortSignal,
  ) {
    const entry = {
      location_id: home,
      device_id: camera,
      requester: receiver,
      receiver,
      operation: "test_image" as const,
    };
    let zone: string;
    try {
      ({ zone } = await this.access(home, camera, receiver, signal));
    } catch (error) {
      if (error instanceof MediaDenied)
        await this.deps.tickets.audit(
          {
            ...entry,
            outcome: "denied",
            ...(error.reason && { denialReason: error.reason }),
          },
          AbortSignal.timeout(30_000),
        );
      throw error;
    }
    const image = await readFile(
      new URL("./delivery-test.jpg", import.meta.url),
      { signal },
    );
    await this.deps.tickets.audit({ ...entry, outcome: "allowed" }, signal);
    return { image, zone };
  }
  async share(
    input: ShareRequest,
    requester: string,
    requestSignal: AbortSignal,
    onStageStarted: () => void,
  ) {
    const { lifetime } = this.deps;
    const signal = AbortSignal.any([requestSignal, lifetime.signal]);
    signal.throwIfAborted();
    return lifetime.track(
      this.shareApproved(input, requester, signal, onStageStarted).catch(
        async (error: unknown) => {
          if (error instanceof MediaDenied)
            await this.deps.tickets.audit(
              {
                ...input,
                receiver: input.receiver_id,
                requester,
                operation: "share",
                outcome: "denied",
                ...(error.reason && { denialReason: error.reason }),
              },
              AbortSignal.timeout(30_000),
            );
          throw error;
        },
      ),
    );
  }
  private async shareApproved(
    input: ShareRequest,
    requester: string,
    signal: AbortSignal,
    onStageStarted: () => void,
  ) {
    const { location_id, device_id, event_id, receiver_id } = input;
    const access = await this.access(
      location_id,
      device_id,
      receiver_id,
      signal,
    );
    if (
      !(await this.deps.eventMatches(location_id, device_id, event_id, signal))
    )
      return undefined;
    const key = {
      householdId: location_id,
      cameraId: device_id,
      eventId: event_id,
      kind: input.kind === "photo" ? ("frame" as const) : ("clip" as const),
      hasSound: input.kind === "clip" && access.policy.sound,
    };
    const item = await this.resolve(key, signal, onStageStarted);
    if (!item) return undefined;
    const identity = { location_id, device_id, event_id };
    if (item === "pending" || item.status === "pending")
      return {
        zone: access.zone,
        data: { ...identity, status: "pending" as const },
      };
    const current = await this.access(
      location_id,
      device_id,
      receiver_id,
      signal,
    );
    if (
      current.approval !== access.approval ||
      current.policy.generation !== access.policy.generation
    )
      throw denied("approval_changed");
    const ticket = await this.deps.tickets.issue(
      item.id,
      receiver_id,
      current.policy.generation,
      current.approval,
      item.expiresAt,
      signal,
    );
    const uri = new URL("/media/items/" + item.id, this.deps.publicUrl);
    uri.searchParams.set("grant", ticket.token);
    await this.deps.tickets.audit(
      {
        ...identity,
        item: item.id,
        receiver: receiver_id,
        requester,
        operation: "share",
        outcome: "allowed",
      },
      signal,
    );
    // Inline bytes only for the authenticated receiver itself. External services use
    // the protected item URL. Bound the inline response independently of storage.
    let image: Buffer | undefined;
    if (
      receiver_id === requester &&
      item.kind === "frame" &&
      item.length <= MAX_INLINE_PHOTO_BYTES
    ) {
      const bytes = await this.read(
        item,
        requester,
        ticket.token,
        0,
        item.length,
        signal,
      );
      if (bytes.byteLength !== item.length)
        throw new Error("Incomplete inline photo.");
      image = Buffer.from(bytes);
    }
    return {
      image,
      zone: current.zone,
      data: {
        ...identity,
        status: "ready" as const,
        item_id: item.id,
        source: "event" as const,
        uri: uri.href,
        mime_type:
          item.kind === "frame"
            ? ("image/jpeg" as const)
            : ("video/mp4" as const),
        captured_at: new Date(item.capturedAt).toISOString(),
        expires_at: new Date(ticket.expiresAt).toISOString(),
      },
    };
  }
  private async resolve(
    key: Omit<EventMediaKey, "capturedAt">,
    signal: AbortSignal,
    onStageStarted: () => void,
  ) {
    const stored = await this.deps.media.find(key, signal);
    if (stored) return stored;
    const source = this.deps.source;
    if (!source) return undefined;
    const identity = JSON.stringify([
      key.householdId,
      key.cameraId,
      key.eventId,
      key.kind,
      key.hasSound,
    ]);
    if (this.preparing.has(identity)) return "pending" as const;
    this.preparing.add(identity);
    try {
      const result = await untilAborted(source(key, signal), signal);
      if (result.status === "available") {
        signal.throwIfAborted();
        onStageStarted();
        return await this.deps.media.stage(
          { ...key, capturedAt: result.capturedAt },
          result.load,
          signal,
        );
      }
      return result.status === "pending" ? ("pending" as const) : undefined;
    } catch (error) {
      if (error instanceof MediaRepresentationUnavailable) return undefined;
      throw error;
    } finally {
      this.preparing.delete(identity);
    }
  }
  async authorize(
    itemId: string,
    receiver: string,
    grant: string,
    signal: AbortSignal,
  ) {
    const item = await this.deps.media.ready(itemId, signal);
    if (!item) throw denied("item_unavailable");
    const { policy, approval } = await this.access(
      item.householdId,
      item.cameraId,
      receiver,
      signal,
    );
    if (item.hasSound && !policy.sound) throw denied("recorded_sound_disabled");
    if (
      !(await this.deps.tickets.valid(
        grant,
        itemId,
        receiver,
        policy.generation,
        approval,
        signal,
      ))
    )
      throw denied("item_grant_invalid");
    return item;
  }
  async auditFetch(
    itemId: string,
    receiver: string,
    outcome: "allowed" | "denied" | "incomplete" | "range_rejected",
    signal: AbortSignal,
    knownItem?: MediaItem,
  ) {
    const item =
      knownItem ?? (await this.deps.media.auditIdentity(itemId, signal));
    // An unknown item cannot disclose media. Audit attempts against known items.
    if (!item) return;
    return this.deps.tickets.audit(
      {
        item: itemId,
        receiver,
        requester: receiver,
        operation: "fetch",
        outcome,
        location_id: item.householdId,
        device_id: item.cameraId,
        event_id: item.eventId,
      },
      signal,
    );
  }
  async read(
    item: MediaItem,
    receiver: string,
    grant: string,
    start: number,
    length: number,
    signal: AbortSignal,
    firstChunk = true,
  ) {
    const bytes = await this.deps.media.read(item.id, start, length, signal);
    if (!bytes) throw denied("item_unavailable");
    // Commit access just before the first bytes. The store still checks the
    // item's retention and deletion state on every subsequent read.
    if (firstChunk) {
      await this.authorize(item.id, receiver, grant, signal);
      await this.auditFetch(item.id, receiver, "allowed", signal, item);
    }
    return bytes;
  }
}
