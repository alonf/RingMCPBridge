// Typed, in-process publish and subscribe for queued manager calls (CD2: a manager never calls
// another manager directly). Each topic is a queue: its messages are handled one at a time, in
// publish order, so no check-then-act on shared state spans two messages (L2).

/** Stops one subscription. Calling it again does nothing. */
export type Unsubscribe = () => void;

/** Handles one message. A rejected promise or a throw goes to `onHandlerError`. */
export type Handler<Message> = (message: Message) => void | Promise<void>;

/** Called once for each handler that fails; the Host wires it to the logger. */
export type HandlerErrorReporter = (topic: string, error: unknown) => void;

/**
 * A message bus over a map of topic names to message types, for example
 * `PubSub<{ "media.capture_requested": CaptureRequest }>`.
 */
export class PubSub<Topics extends Record<string, unknown>> {
  readonly #handlers = new Map<keyof Topics, Set<Handler<never>>>();
  readonly #queues = new Map<keyof Topics, Promise<void>>();
  readonly #onHandlerError: HandlerErrorReporter;

  constructor(onHandlerError: HandlerErrorReporter) {
    this.#onHandlerError = onHandlerError;
  }

  subscribe<Topic extends keyof Topics>(
    topic: Topic,
    handler: Handler<Topics[Topic]>,
  ): Unsubscribe {
    const handlers = this.#handlers.get(topic) ?? new Set<Handler<never>>();
    handlers.add(handler);
    this.#handlers.set(topic, handlers);
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Queues the message and returns at once. The topic's handlers run later, after every message
   * published to the topic before it, in the order they subscribed.
   */
  publish<Topic extends keyof Topics>(
    topic: Topic,
    message: Topics[Topic],
  ): void {
    const previous = this.#queues.get(topic) ?? Promise.resolve();
    const next = previous.then(() => this.#deliver(topic, message));
    this.#queues.set(topic, next);
  }

  /** Resolves when every queue is empty, including messages that handlers published meanwhile. */
  async drain(): Promise<void> {
    for (;;) {
      const pending = [...this.#queues.values()];
      await Promise.all(pending);
      const settled = [...this.#queues.values()].every((queue) =>
        pending.includes(queue),
      );
      if (settled) {
        return;
      }
    }
  }

  async #deliver<Topic extends keyof Topics>(
    topic: Topic,
    message: Topics[Topic],
  ): Promise<void> {
    const handlers = [...(this.#handlers.get(topic) ?? [])] as Handler<
      Topics[Topic]
    >[];
    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (error) {
        this.#report(topic, error);
      }
    }
  }

  #report(topic: keyof Topics, error: unknown): void {
    try {
      this.#onHandlerError(String(topic), error);
    } catch {
      // A failing reporter must not stop the queue.
    }
  }
}
