// The current link (CP-09, T016): a holder the Host creates once per process and hands to the
// component that opens links and to those that send on them. It only holds; deciding when a link
// is ready to carry messages belongs to whoever puts it here (CD X2: no logic in the transport).
import type { LinkConnection } from "./link-connection.ts";

/** Holds the link that is open and ready to carry messages, or none. */
export class LinkSlot {
  #link: LinkConnection | undefined;

  /** The link to send on, or `undefined` while there is none. */
  get current(): LinkConnection | undefined {
    return this.#link;
  }

  /** Makes `link` the current one. */
  put(link: LinkConnection): void {
    this.#link = link;
  }

  /** Empties the slot, but only if `link` is still the current one. */
  clear(link: LinkConnection): void {
    if (this.#link === link) {
      this.#link = undefined;
    }
  }
}
