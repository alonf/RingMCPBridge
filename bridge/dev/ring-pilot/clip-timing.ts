import { execFile } from "node:child_process";
import { z } from "zod";

// ffprobe reports decimal seconds to six places. Work in microseconds until
// rounding the final endpoint outwards to Ring's millisecond clock.
const micros = z
  .string()
  .regex(/^\d{1,8}(?:\.\d{1,6})?$/)
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  });
const timing = z.object({
  start_time: micros,
  duration: micros.pipe(z.number().positive()),
});
const report = z.object({
  format: timing,
  streams: z.array(timing.extend({ codec_type: z.enum(["video", "audio"]) })),
});

export async function clipDurationMs(
  bytes: Buffer,
): Promise<number | undefined> {
  const output = await new Promise<string | undefined>((resolve, reject) => {
    const child = execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "pipe",
        "-f",
        "mov",
        "-show_entries",
        "format=start_time,duration:stream=codec_type,start_time,duration",
        "-of",
        "json",
        "pipe:0",
      ],
      {
        timeout: 10_000,
        killSignal: "SIGKILL",
        windowsHide: true,
        maxBuffer: 64 * 1024,
      },
      (error, stdout, stderr) => {
        if (error?.code === "ENOENT")
          reject(new Error("ffprobe is required to measure pilot clips."));
        else resolve(error || stderr.trim() ? undefined : stdout);
      },
    );
    // ffprobe may finish reading the MP4 index before consuming the payload.
    // Its exit status and timing report determine whether inspection succeeded.
    child.stdin?.on("error", () => undefined).end(bytes);
  });
  if (!output) return undefined;
  const parsed = report.safeParse(JSON.parse(output));
  if (!parsed.success) return undefined;
  const { format, streams } = parsed.data;
  if (format.start_time !== 0 || !streams.some((s) => s.codec_type === "video"))
    return undefined;
  return Math.ceil(
    Math.max(
      format.duration,
      ...streams.map((s) => s.start_time + s.duration),
    ) / 1000,
  );
}
