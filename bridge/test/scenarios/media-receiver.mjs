// A separate receiver process. Its OAuth token stays in its private input pipe.
import { createHash } from "node:crypto";
let input = "";
for await (const chunk of process.stdin) input += chunk.toString();
const { url, origin, token, range } = JSON.parse(input);
const target = new URL(url);
if (target.origin !== origin || target.hostname !== "127.0.0.1")
  throw new Error("Unexpected pilot host.");
const response = await fetch(target, {
  headers: { authorization: "Bearer " + token, ...(range && { range }) },
  redirect: "error",
});
const body = Buffer.from(await response.arrayBuffer());
process.stdout.write(
  JSON.stringify({
    status: response.status,
    type: response.headers.get("content-type"),
    length: body.length,
    digest: createHash("sha256").update(body).digest("hex"),
  }),
);
