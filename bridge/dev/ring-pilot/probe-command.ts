import {
  CALLBACK_MEDIA_DELAY_MS,
  EventProbeError,
} from "../../src/connector/access/ring-partner/event-media.ts";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PilotLinks,
  SavedLink,
} from "../../src/connector/access/ring-partner/links.ts";
import type { ringClient } from "../../src/connector/access/ring-partner/client.ts";

async function waitForRecording(
  ring: ReturnType<typeof ringClient>,
  links: PilotLinks,
  link: SavedLink,
  name: string,
  kind: "ding" | "motion",
  linkedAt: number,
) {
  function access() {
    const now = Date.now();
    const current = links
      .load()
      .find(
        (item) =>
          item.account === link.account && item.session === link.session,
      );
    if (!current || current.expires <= now || current.tokenExpiry <= now)
      throw new EventProbeError(
        "The original Ring link is no longer available.",
      );
    return current.access;
  }
  const camera = await ring.eventCamera(access(), { name });
  const watch = links.watchRecording(
    link.account,
    camera.deviceId,
    kind,
    Date.now(),
  );
  try {
    console.info(
      "Waiting up to ten minutes for a signed callback from the selected camera.",
    );
    let receipt = links.watchedRecording(watch, Date.now());
    while (!receipt) {
      await delay(500);
      receipt = links.watchedRecording(watch, Date.now());
    }
    await delay(
      Math.max(0, receipt.time + CALLBACK_MEDIA_DELAY_MS - Date.now()),
    );
    const deadline = receipt.time + 120_000;
    const result = await ring.callbackMedia(
      access(),
      camera,
      receipt,
      linkedAt,
      Date.now(),
      async (attempt) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return undefined;
        const backoff = Math.min(8000, 1000 * 2 ** attempt);
        await delay(
          Math.min(Math.ceil(backoff * (1 + Math.random())), remaining),
        );
        return Date.now() >= deadline ? undefined : access();
      },
    );
    access();
    return {
      ...result,
      identitySource: "signed-webhook" as const,
      kind,
      componentIds: receipt.components,
      ...(receipt.subType && { subType: receipt.subType }),
    };
  } finally {
    links.finishWatch(watch);
  }
}

/** Local operator entry point. Token rotation stays with the running pilot. */
export async function runEventProbe(
  ring: ReturnType<typeof ringClient>,
  links: PilotLinks,
  directory: string,
  camera: string,
  kind: string,
  eventId?: string,
  accountHint?: string,
  fromCallback = false,
  bridgeEventId?: string,
) {
  if ((fromCallback && eventId) || (bridgeEventId && (fromCallback || eventId)))
    throw new EventProbeError(
      "Choose either a new signed callback or a history event ID.",
    );
  const now = Date.now();
  const candidates = links
    .load()
    .filter(
      (link) =>
        link.expires > now &&
        (!accountHint ||
          accountHint === link.masked ||
          accountHint === link.account),
    );
  const [link] = candidates;
  if (candidates.length !== 1 || !link?.linkedAt)
    throw new EventProbeError(
      "Select one confirmed account with a known link time.",
    );
  if (link.tokenExpiry <= now)
    throw new EventProbeError(
      "The saved access token has expired. Resume the linked home pilot before running the probe.",
    );
  async function fromPairedEvent(
    link: SavedLink,
    id: string,
    linkedAt: number,
  ) {
    const receipt = links.recordingById(link.account, id, now);
    if (!receipt)
      throw new EventProbeError(
        "No such paired recording for this account and event kind.",
      );
    const cameraId = {
      deviceId: receipt.deviceId,
      householdId: receipt.householdId,
    };
    const result = await ring.callbackMedia(
      link.access,
      cameraId,
      receipt,
      linkedAt,
      now,
    );
    if (
      result.bridgeEventId !== id ||
      !links
        .load()
        .some(
          (item) =>
            item.account === link.account &&
            item.session === link.session &&
            item.expires > Date.now(),
        )
    )
      throw new EventProbeError(
        "The original recording or Ring link is no longer available.",
      );
    return {
      ...result,
      kind: receipt.kind,
      identitySource: "signed-webhook",
      componentIds: receipt.components,
      ...(receipt.subType && { subType: receipt.subType }),
    };
  }
  const linkedAt = link.linkedAt;
  const read = () => {
    if (bridgeEventId) return fromPairedEvent(link, bridgeEventId, linkedAt);
    if (!camera || (kind !== "ding" && kind !== "motion"))
      throw new EventProbeError("Choose one camera and ding or motion.");
    return fromCallback
      ? waitForRecording(ring, links, link, camera, kind, linkedAt)
      : ring.eventMedia(link.access, camera, kind, linkedAt, now, eventId);
  };
  const { photo, clip, ...source } = await read();
  const folder = await mkdtemp(join(directory, "ring-event-probe-"));
  const persist = async (filename: string, item: typeof photo) => {
    if (item.status !== "available") return item;
    await writeFile(join(folder, filename), item.bytes, {
      flag: "wx",
      mode: 0o600,
    });
    const { bytes, ...metadata } = item;
    return { ...metadata, size: bytes.length };
  };
  const result = {
    ...source,
    photo: await persist("event.jpg", photo),
    clip: await persist("event.mp4", clip),
  };
  await writeFile(join(folder, "event.json"), JSON.stringify(result), {
    flag: "wx",
    mode: 0o600,
  });
  console.info("Photo:", photo.status, "Clip:", clip.status);
  console.info("Private evidence directory:", folder);
  return photo.status === "available" && clip.status === "available";
}
