import { z } from "zod";

const DAY_MS = 86_400_000;
const MAX_BYTES = 8 * 1024 * 1024;
const capabilities = z.object({
  data: z.object({
    attributes: z.object({
      components: z
        .object({
          items: z
            .array(
              z.object({
                component_id: z.string().min(1),
                component_type: z.string(),
              }),
            )
            .min(1),
        })
        .optional(),
    }),
  }),
});

export interface Snapshot {
  jpeg: Buffer;
  time: string;
}

export class SnapshotError extends Error {}

type SnapshotStep =
  | "reading camera capabilities"
  | "requesting a snapshot"
  | "downloading the JPEG";

function checkStatus(status: number, step: SnapshotStep) {
  if (status >= 400) console.warn("Ring snapshot HTTP", status, "while", step);
  if (step !== "reading camera capabilities" && status === 416)
    throw new SnapshotError("Ring found no image in the requested time range.");
  if (step !== "reading camera capabilities" && status === 425)
    throw new SnapshotError(
      "Ring is still processing the image. Try again shortly.",
    );
  if (status >= 400)
    throw new SnapshotError(
      "Ring returned HTTP " + String(status) + " while " + step + ".",
    );
}

async function readJpeg(response: Response) {
  if (
    response.headers.get("content-type")?.split(";")[0] !== "image/jpeg" ||
    !response.body
  )
    throw new SnapshotError("Ring did not return a JPEG.");
  const reader: ReadableStreamDefaultReader<Uint8Array> =
    response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new SnapshotError("The JPEG exceeded the pilot download limit.");
    }
    parts.push(value);
  }
  const jpeg = Buffer.concat(parts, size);
  if (
    jpeg[0] !== 0xff ||
    jpeg[1] !== 0xd8 ||
    jpeg.at(-2) !== 0xff ||
    jpeg.at(-1) !== 0xd9
  )
    throw new SnapshotError("Ring returned an incomplete JPEG.");
  return jpeg;
}

/** Fetch an existing image for a device that belongs to the linked inventory. */
export async function downloadSnapshot(
  deviceUrl: string,
  request: (url: string, init: RequestInit) => Promise<Response>,
  token: string,
  send: typeof fetch,
  end: number,
  linkedAt: number,
): Promise<Snapshot> {
  const start = Math.max(end - DAY_MS, linkedAt);
  if (start >= end)
    throw new SnapshotError(
      "The camera was just linked. Try again shortly for a post-link snapshot.",
    );
  const headers = {
    authorization: "Bearer " + token,
    "content-type": "application/json",
  };
  const info = await request(deviceUrl + "/capabilities", { headers });
  checkStatus(info.status, "reading camera capabilities");
  const { components } = capabilities.parse(await info.json()).data.attributes;
  const lens = components?.items.find((item) => item.component_type === "lens");
  if (components && !lens)
    throw new SnapshotError(
      "Ring did not identify a camera lens for this device.",
    );
  const result = await request(deviceUrl + "/media/image/download", {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "latest_in_range",
      start_timestamp: start,
      end_timestamp: end,
      image_options: {
        format: "jpeg",
        resolution: { width: 1280, height: 720 },
      },
      ...(lens && { components: [{ component_id: lens.component_id }] }),
    }),
  });
  checkStatus(result.status, "requesting a snapshot");
  let media = result;
  if (result.status === 303) {
    const location = new URL(result.headers.get("location") ?? "");
    if (
      location.protocol !== "https:" ||
      location.username ||
      location.password
    )
      throw new SnapshotError("Ring returned an invalid media location.");
    // Only the signed URL from Ring goes to its download service.
    media = await send(location, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  }
  checkStatus(media.status, "downloading the JPEG");
  if (media.status !== 200)
    throw new SnapshotError("Unexpected Ring media response.");
  const timestamp = Number(media.headers.get("X-Media-Timestamp"));
  if (!Number.isSafeInteger(timestamp) || timestamp < start || timestamp > end)
    throw new SnapshotError(
      "Ring did not return a capture time in the requested window.",
    );
  return {
    time: new Date(timestamp).toISOString(),
    jpeg: await readJpeg(media),
  };
}
