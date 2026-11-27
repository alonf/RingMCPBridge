import type {
  LinkConnection,
  LinkFrame,
} from "../../../utilities/link-transport/index.ts";
import { partnerRequest, type PartnerOperation } from "./messages/index.ts";
import type { PartnerResult } from "../../../core/clients/connector-link/messages/index.ts";
export type PartnerHandler = (
  operation: PartnerOperation,
) => Promise<PartnerResult>;

/** Public Ring traffic has its own bounded work queue on a proven session. */
export class HomePartner {
  private pending = 0;
  constructor(privateLink: LinkConnection, handler: PartnerHandler) {
    this.link = privateLink;
    this.handler = handler;
  }
  private readonly link: LinkConnection;
  private readonly handler: PartnerHandler;
  receive(frame: LinkFrame) {
    if (frame.type !== "partner_request" || frame.kind !== "message")
      return false;
    const parsed = partnerRequest.safeParse(frame.body);
    if (!parsed.success) return true;
    const { id, operation } = parsed.data;
    const reply = (result: PartnerResult) =>
      this.link.send({ type: "partner_reply", body: { id, result } });
    if (this.pending >= 8) {
      void reply({ status: 503 });
      return true;
    }
    this.pending++;
    void this.handler(operation)
      .catch(() => ({ status: 502 as const }))
      .then(reply)
      .finally(() => {
        this.pending--;
      });
    return true;
  }
}
