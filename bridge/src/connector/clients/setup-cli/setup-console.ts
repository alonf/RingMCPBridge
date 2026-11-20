// The owner's terminal as the Setup CLI sees it (T028): a question and its answer, and a line
// shown. The terminal one is terminal-console.ts; tests script the owner's answers.

/** How a question is asked. */
export interface AskOptions {
  /** The answer is not shown as it is typed: the password. */
  readonly hidden?: boolean;
}

/** The owner's terminal. */
export interface SetupConsole {
  /** Asks the owner. Rejects when the input ends before an answer. */
  ask(question: string, options?: AskOptions): Promise<string>;
  /** Shows a line. */
  say(line: string): void;
}
