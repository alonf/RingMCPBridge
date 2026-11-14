// The Setup CLI's console over a terminal (T028): Node's readline, with the echo of a hidden
// answer (the password) swallowed. Ctrl+C hands over to `onInterrupt`, and the input ending
// before an answer rejects the question.
import { createInterface } from "node:readline";
import type { Interface } from "node:readline";
import { Writable } from "node:stream";
import type { Readable } from "node:stream";
import type { AskOptions, SetupConsole } from "./setup-console.ts";

const NEWLINE = "\n";

/** What the terminal is: its input and output, and what Ctrl+C does. */
export interface TerminalConsoleOptions {
  readonly input: Readable;
  readonly output: NodeJS.WritableStream;
  /** Ctrl+C: the caller ends the setup. */
  readonly onInterrupt: () => void;
}

/** The readline echo, passed through to the terminal unless a hidden answer is being typed. */
class Echo extends Writable {
  readonly #target: NodeJS.WritableStream;
  muted = false;

  constructor(target: NodeJS.WritableStream) {
    super();
    this.#target = target;
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      this.#target.write(chunk);
    }
    done();
  }
}

/** A console over a terminal. `close` ends it. */
export class TerminalConsole implements SetupConsole {
  readonly #output: NodeJS.WritableStream;
  readonly #echo: Echo;
  readonly #lines: Interface;
  #ended = false;
  #waiting: ((error: Error) => void) | undefined;

  constructor(options: TerminalConsoleOptions) {
    this.#output = options.output;
    this.#echo = new Echo(options.output);
    this.#lines = createInterface({
      input: options.input,
      output: this.#echo,
      terminal: true,
    });
    this.#lines.on("SIGINT", options.onInterrupt);
    this.#lines.on("close", () => {
      this.#ended = true;
      this.#waiting?.(new Error("The input ended before an answer."));
      this.#waiting = undefined;
    });
  }

  ask(question: string, options: AskOptions = {}): Promise<string> {
    if (this.#ended) {
      return Promise.reject(new Error("The input has ended."));
    }
    const hidden = options.hidden === true;
    return new Promise((resolve, reject) => {
      this.#waiting = reject;
      if (hidden) {
        this.#output.write(question);
        this.#echo.muted = true;
      }
      this.#lines.question(hidden ? "" : question, (answer) => {
        this.#waiting = undefined;
        if (hidden) {
          this.#echo.muted = false;
          this.#output.write(NEWLINE);
        }
        // A password is kept as typed; other answers lose surrounding spaces.
        resolve(hidden ? answer : answer.trim());
      });
    });
  }

  say(line: string): void {
    this.#output.write(`${line}${NEWLINE}`);
  }

  /** Ends the console and gives the terminal back. */
  close(): void {
    this.#lines.close();
  }
}
