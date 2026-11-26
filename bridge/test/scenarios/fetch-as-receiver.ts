import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
const received = z.object({
  status: z.number(),
  type: z.string().nullable(),
  length: z.number(),
  digest: z.string(),
});
export async function fetchAs(
  origin: string,
  url: string,
  token: string,
  range?: string,
) {
  const proc = spawn(
    process.execPath,
    [fileURLToPath(new URL("./media-receiver.mjs", import.meta.url))],
    { stdio: ["pipe", "pipe", "ignore"], windowsHide: true },
  );
  const result = new Promise<string>((resolve, reject) => {
    let output = "";
    proc.stdout.on("data", (b: Buffer) => {
      output += b.toString();
    });
    proc.once("error", reject);
    proc.once("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error("Receiver failed."));
    });
  });
  proc.stdin.end(JSON.stringify({ origin, url, token, range }));
  return received.parse(JSON.parse(await result));
}
