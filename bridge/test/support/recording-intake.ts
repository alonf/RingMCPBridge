// Event's intake as a recorder (T017), for the link's tests until the Event manager exists (T018):
// it records each call, and can hold the next calls or fail them.
import type {
  EventIntake,
  HomeLinkSession,
} from "../../src/core/managers/event/index.ts";

/** The intake operations, by name. */
export type IntakeMethod =
  "homeSessionOpened" | "inventory" | "deviceState" | "heartbeat";

/** One call Event's stand-in received. */
export interface IntakeCall {
  readonly method: IntakeMethod;
  readonly body: unknown;
  readonly session: HomeLinkSession;
}

/** Event's stand-in: records each call, and can hold or fail the next ones. */
export class RecordingIntake implements EventIntake {
  readonly calls: IntakeCall[] = [];
  holding = false;
  /** Holds only this kind of call, while the others go through. */
  heldMethod: IntakeMethod | undefined;
  #failuresLeft = 0;
  #held: (() => void)[] = [];

  failNext(count: number): void {
    this.#failuresLeft += count;
  }

  release(): void {
    this.holding = false;
    this.heldMethod = undefined;
    for (const resume of this.#held.splice(0)) {
      resume();
    }
  }

  homeSessionOpened(session: HomeLinkSession): Promise<void> {
    return this.#record("homeSessionOpened", session, session);
  }

  inventory(body: unknown, session: HomeLinkSession): Promise<void> {
    return this.#record("inventory", body, session);
  }

  deviceState(body: unknown, session: HomeLinkSession): Promise<void> {
    return this.#record("deviceState", body, session);
  }

  heartbeat(body: unknown, session: HomeLinkSession): Promise<void> {
    return this.#record("heartbeat", body, session);
  }

  methods(): IntakeMethod[] {
    return this.calls.map((call) => call.method);
  }

  async #record(
    method: IntakeMethod,
    body: unknown,
    session: HomeLinkSession,
  ): Promise<void> {
    this.calls.push({ method, body, session });
    if (this.holding || this.heldMethod === method) {
      await new Promise<void>((resume) => this.#held.push(resume));
    }
    if (this.#failuresLeft > 0) {
      this.#failuresLeft -= 1;
      throw new Error("The commit failed.");
    }
  }
}
