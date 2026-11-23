import { MediaRepresentationUnavailable } from "../../access/media/index.ts";
import type {
  EventMedia,
  EventMediaKey,
  MediaContent,
  MediaItem,
  MediaTickets,
} from "../../access/media/index.ts";
import type {
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
export class MediaDenied extends Error {}
export class MediaSettingsUnavailable extends Error {}
interface Dependencies {
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
/** Coordinates the same owner policy for issuance, cached hits and each receiver read. */
export class MediaHandoff {
  private readonly deps: Dependencies;
  private readonly preparing = new Set<string>();
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  async options(signal: AbortSignal) {
    const { state, settings } = this.deps;
    const [locations, devices, agents] = await Promise.all([
      state.locations(signal),
      state.devices({}, signal),
      settings.agents(signal),
    ]);
    return {
      sharedPersonEventsAllowed: this.deps.sharedPersonEventsAllowed,
      locations,
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
      if (change.approved) await this.checkReceiver(receiver, signal);
    } catch (cause) {
      if (cause instanceof MediaDenied) throw cause;
      throw new MediaSettingsUnavailable(
        "The camera settings could not be checked.",
        { cause },
      );
    }
    await this.deps.permissions.save(home, device, receiver, change, signal);
  }
  private async checkCamera(home: string, device: string, signal: AbortSignal) {
    const [location, camera] = await Promise.all([
      this.deps.state.location(home, signal),
      this.deps.state.device(device, signal),
    ]);
    if (
      !location ||
      !camera ||
      !isCamera(camera.type) ||
      camera.location_id !== home
    )
      throw new MediaDenied();
    return location;
  }
  private async checkReceiver(receiver: string, signal: AbortSignal) {
    const agent = await this.deps.settings.agent(receiver, signal);
    if (
      !agent ||
      agent.revoked_at !== undefined ||
      !agent.scopes.includes("media")
    )
      throw new MediaDenied();
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
    if (!policy.enabled || !approval) throw new MediaDenied();
    return { policy, approval, zone: location.time_zone };
  }
  async share(input: ShareRequest, requester: string, signal: AbortSignal) {
    try {
      return await this.shareApproved(input, requester, signal);
    } catch (error) {
      if (error instanceof MediaDenied)
        await this.deps.tickets.audit(
          {
            ...input,
            receiver: input.receiver_id,
            requester,
            operation: "share",
            outcome: "denied",
          },
          signal,
        );
      throw error;
    }
  }
  private async shareApproved(
    input: ShareRequest,
    requester: string,
    signal: AbortSignal,
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
    const item = await this.resolve(key, signal);
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
      throw new MediaDenied();
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
    return {
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
      if (result.status === "available")
        return await this.deps.media.stage(
          { ...key, capturedAt: result.capturedAt },
          result.load,
          signal,
        );
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
    if (!item) throw new MediaDenied();
    const { policy, approval } = await this.access(
      item.householdId,
      item.cameraId,
      receiver,
      signal,
    );
    if (
      (item.hasSound && !policy.sound) ||
      !(await this.deps.tickets.valid(
        grant,
        itemId,
        receiver,
        policy.generation,
        approval,
        signal,
      ))
    )
      throw new MediaDenied();
    return item;
  }
  async auditFetch(
    itemId: string,
    receiver: string,
    outcome: "allowed" | "denied",
    signal: AbortSignal,
    knownItem?: MediaItem,
  ) {
    const item = knownItem ?? (await this.deps.media.ready(itemId, signal));
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
  ) {
    const bytes = await this.deps.media.read(item.id, start, length, signal);
    if (!bytes) throw new MediaDenied();
    await this.authorize(item.id, receiver, grant, signal);
    await this.auditFetch(item.id, receiver, "allowed", signal, item);
    return bytes;
  }
}
