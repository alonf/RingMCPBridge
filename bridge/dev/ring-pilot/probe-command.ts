import { EventProbeError } from "./event-media.ts";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PilotLinks } from "./links.ts";
import type { ringClient } from "./client.ts";

/** Local operator entry point. Token rotation stays with the running pilot. */
export async function runEventProbe(
  ring: ReturnType<typeof ringClient>,
  links: PilotLinks,
  directory: string,
  camera: string,
  kind: string,
  eventId?: string,
  accountHint?: string,
) {
  if (!camera || (kind !== "ding" && kind !== "motion"))
    throw new EventProbeError("Choose one camera and ding or motion.");
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
  const { photo, clip, ...source } = await ring.eventMedia(
    link.access,
    camera,
    kind,
    link.linkedAt,
    now,
    eventId,
  );
  const folder = await mkdtemp(join(directory, "ring-event-probe-"));
  const persist = async (filename: string, item: typeof photo) => {
    if (item.status !== "available") return item;
    await writeFile(join(folder, filename), item.bytes, {
      flag: "wx",
      mode: 0o600,
    });
    return { status: item.status, time: item.time, size: item.bytes.length };
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
