// A value that must never be logged or sent on the link (FR-034, SC4). It prints, stringifies and
// serializes to JSON as a placeholder, so a log line or a link frame that picks it up by mistake
// carries no secret. Only `reveal()` hands out the value, at the one place that needs it.
import { inspect } from "node:util";

const HIDDEN = "[secret]";

/** A secret value. `reveal()` is the only way to read it. */
export class Secret<T> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  /** The value itself, for the call that needs it (Ring sign-in, the file's own write). */
  reveal(): T {
    return this.#value;
  }

  toJSON(): string {
    return HIDDEN;
  }

  toString(): string {
    return HIDDEN;
  }

  [inspect.custom](): string {
    return HIDDEN;
  }
}
