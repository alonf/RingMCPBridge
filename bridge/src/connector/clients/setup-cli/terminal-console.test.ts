// The terminal console (T028) over stand-in streams: a question and its answer are shown, a hidden
// answer (the password) is not echoed and is kept as typed, Ctrl+C goes to `onInterrupt`, and the
// input ending rejects the question.
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalConsole } from "./index.ts";

const PASSWORD = " pass-SECRET-0001 ";
const CTRL_C = "\u0003";

interface Terminal {
  readonly input: PassThrough;
  readonly shown: () => string;
  readonly console: TerminalConsole;
  readonly interrupts: number[];
}

const opened: TerminalConsole[] = [];

afterEach(() => {
  for (const console of opened.splice(0)) {
    console.close();
  }
});

function terminal(): Terminal {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  const interrupts: number[] = [];
  const console = new TerminalConsole({
    input,
    output,
    onInterrupt: () => interrupts.push(1),
  });
  opened.push(console);
  return { input, shown: () => chunks.join(""), console, interrupts };
}

describe("the terminal console", () => {
  it("shows a question and the answer typed, and returns it trimmed", async () => {
    const test = terminal();

    const answer = test.console.ask("Ring account email: ");
    test.input.write(" the-owner\r");

    await expect(answer).resolves.toBe("the-owner");
    expect(test.shown()).toContain("Ring account email: ");
    expect(test.shown()).toContain("the-owner");
  });

  it("shows a hidden question but not what is typed, and keeps the answer as typed", async () => {
    const test = terminal();

    const answer = test.console.ask("Ring password (not shown): ", {
      hidden: true,
    });
    test.input.write(`${PASSWORD}\r`);

    await expect(answer).resolves.toBe(PASSWORD);
    expect(test.shown()).toContain("Ring password (not shown): ");
    expect(test.shown()).not.toContain(PASSWORD.trim());
    // What follows is shown again.
    test.console.say("Signing in to Ring...");
    expect(test.shown()).toContain("Signing in to Ring...\n");
  });

  it("hands Ctrl+C to onInterrupt", async () => {
    const test = terminal();
    void test.console.ask("Ring account email: ").catch(() => undefined);

    test.input.write(CTRL_C);
    await new Promise((resolve) => setImmediate(resolve));

    expect(test.interrupts).toEqual([1]);
  });

  it("rejects the question when the input ends, and every later one", async () => {
    const test = terminal();
    const answer = test.console.ask("Ring account email: ");

    test.input.end();

    await expect(answer).rejects.toThrow("The input ended before an answer.");
    await expect(test.console.ask("Again: ")).rejects.toThrow(
      "The input has ended.",
    );
  });
});
