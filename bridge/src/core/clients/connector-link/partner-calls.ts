import { randomUUID } from "node:crypto";
import type {
  LinkConnection,
  LinkFrame,
} from "../../../utilities/link-transport/index.ts";
import type { PartnerOperation } from "../../../connector/clients/core-link/messages/index.ts";
import { partnerReply, type PartnerResult } from "./messages/index.ts";

export class PartnerCalls {
  capable = false;
  private readonly link: LinkConnection;
  private readonly waiting = new Map<string, (result: PartnerResult) => void>();
  constructor(link: LinkConnection) {
    this.link = link;
    link.onClose(() => {
      this.capable = false;
      for (const finish of this.waiting.values()) finish({ status: 503 });
    });
  }
  async call(
    operation: PartnerOperation,
    signal: AbortSignal,
  ): Promise<PartnerResult> {
    if (!this.capable || signal.aborted || this.waiting.size >= 8)
      return { status: 503 };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    const id = randomUUID();
    const wait = Promise.withResolvers<PartnerResult>();
    const cancel = () => {
      wait.resolve({ status: 503 });
    };
    this.waiting.set(id, wait.resolve);
    deadline.addEventListener("abort", cancel, { once: true });
    try {
      void this.link
        .send({ type: "partner_request", body: { id, operation } })
        .then((sent) => {
          if (sent !== "sent") cancel();
        }, cancel);
      return await wait.promise;
    } finally {
      deadline.removeEventListener("abort", cancel);
      this.waiting.delete(id);
    }
  }
  receive(frame: LinkFrame) {
    if (frame.kind !== "message") return false;
    if (frame.type === "partner_capable") {
      this.capable = true;
      return true;
    }
    if (frame.type !== "partner_reply") return false;
    const reply = partnerReply.safeParse(frame.body);
    if (reply.success) this.waiting.get(reply.data.id)?.(reply.data.result);
    return true;
  }
}
