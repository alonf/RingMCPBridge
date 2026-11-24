import { mediaLocation } from "./media-location.ts";
import { z } from "zod";
import { capabilities, readJpeg } from "./snapshot.ts";

export class EventProbeError extends Error {}

const stamp = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().nonnegative());
const history = z.object({
  data: z.array(
    z.object({
      type: z.literal("history-events"),
      id: z.string().min(1),
      attributes: z.object({
        event_type: z.string(),
        start: stamp,
        end: stamp.nullish(),
      }),
      relationships: z.object({
        source: z.object({
          data: z.object({ type: z.literal("devices"), id: z.string() }),
        }),
      }),
    }),
  ),
});

type Request = (url: string, init: RequestInit) => Promise<Response>;
type Result =
  | { status: "available"; time: number; bytes: Buffer }
  | {
      status: "pending" | "missing" | "upstream-error" | "unmatched";
      httpStatus?: number;
    };
const PROBE_MS = 5000;
const PROCESSING_WINDOW_MS = 120_000;
const MAX_BYTES = 32 * 1024 * 1024;

async function boundedBytes(response: Response) {
  const body = response.body;
  if (!body) throw new EventProbeError("Empty media");
  const reader: ReadableStreamDefaultReader<Uint8Array> = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new EventProbeError("Media exceeds the pilot size limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

function mediaStatus(
  response: Response,
  recordingMayBeProcessing: boolean,
): Result {
  const httpStatus = response.status;
  if (httpStatus === 416)
    return {
      status: recordingMayBeProcessing ? "pending" : "missing",
      httpStatus,
    };
  if (httpStatus === 425) return { status: "pending", httpStatus };
  return { status: "upstream-error", httpStatus };
}

interface EventWindow {
  deviceUrl: string;
  headers: Record<string, string>;
  components: { component_id: string }[] | undefined;
  start: number;
  end: number;
  recordingMayBeProcessing: boolean;
}

async function fetchItem(
  kind: "image" | "video",
  window: EventWindow,
  request: Request,
  send: typeof fetch,
): Promise<Result> {
  const { deviceUrl, headers, components, start, end } = window;
  const photo = kind === "image";
  const body = photo
    ? {
        type: "latest_in_range",
        start_timestamp: start,
        end_timestamp: end - 1,
        image_options: {
          format: "jpeg",
          resolution: { width: 1280, height: 720 },
        },
      }
    : {
        timestamp: start,
        duration: end - start,
        video_options: { codec: "avc" },
        audio_options: { audio_enabled: true },
      };
  try {
    let response = await request(deviceUrl + "/media/" + kind + "/download", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, components }),
    });
    if (response.status === 303 || response.status === 301) {
      const target = mediaLocation(response.headers.get("location"));
      if (!target)
        return { status: "upstream-error", httpStatus: response.status };
      response = await send(target, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    }
    if (
      response.status !== 200 &&
      !(kind === "video" && response.status === 206)
    )
      return mediaStatus(response, window.recordingMayBeProcessing);
    const raw = response.headers.get("x-media-timestamp");
    const time = Number(raw);
    if (!raw || !Number.isSafeInteger(time) || time < start || time >= end)
      return { status: "unmatched" };
    if (response.status === 206) {
      const length = Number(response.headers.get("x-media-length"));
      if (!Number.isSafeInteger(length) || length <= 0 || time + length > end)
        return { status: "unmatched" };
    } else if (!photo && time !== start) return { status: "unmatched" };
    if (
      response.headers.get("content-type")?.split(";")[0] !==
      (photo ? "image/jpeg" : "video/mp4")
    )
      return { status: "unmatched" };
    if (photo)
      return { status: "available", time, bytes: await readJpeg(response) };
    const bytes = await boundedBytes(response);
    if (bytes.toString("ascii", 4, 8) !== "ftyp")
      return { status: "unmatched" };
    return { status: "available", time, bytes };
  } catch {
    return { status: "upstream-error" };
  }
}

/** The history row identifies the recording. Neither media call may widen its interval. */
export async function probeEventMedia(
  api: string,
  deviceId: string,
  householdId: string,
  kind: "ding" | "motion",
  linkedAt: number,
  now: number,
  eventId: string | undefined,
  token: string,
  request: Request,
  send: typeof fetch,
) {
  const id = encodeURIComponent(deviceId);
  const deviceUrl = api + "/devices/" + id;
  const headers = {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
  const response = await request(
    api + "/history/devices/" + id + "/events?event_types=" + kind,
    { headers },
  );
  if (!response.ok)
    throw new EventProbeError(
      "Ring history returned HTTP " + String(response.status) + ".",
    );
  const events = history.parse(await response.json()).data;
  const event = events.find(
    (e) =>
      e.attributes.event_type === kind &&
      e.relationships.source.data.id === deviceId &&
      e.attributes.start >= linkedAt &&
      e.attributes.end != null &&
      e.attributes.end > e.attributes.start &&
      e.attributes.end <= now &&
      (!eventId || e.id === eventId),
  );
  if (!event?.attributes.end)
    throw new EventProbeError(
      "No matching completed post-link event on this history page.",
    );
  const info = await request(deviceUrl + "/capabilities", { headers });
  if (!info.ok)
    throw new EventProbeError(
      "Ring capabilities returned HTTP " + String(info.status) + ".",
    );
  const { components } = capabilities.parse(await info.json()).data.attributes;
  const lenses = components?.items.filter((c) => c.component_type === "lens");
  if (lenses && lenses.length !== 1)
    throw new EventProbeError("History does not identify a unique event lens.");
  const selected = lenses?.map((lens) => ({ component_id: lens.component_id }));
  const start = event.attributes.start;
  const end = Math.min(start + PROBE_MS, event.attributes.end);
  const window = {
    deviceUrl,
    headers,
    components: selected,
    start,
    end,
    recordingMayBeProcessing: now < end + PROCESSING_WINDOW_MS,
  };
  const photo = await fetchItem("image", window, request, send);
  const clip = await fetchItem("video", window, request, send);
  return { eventId: event.id, deviceId, householdId, start, end, photo, clip };
}
