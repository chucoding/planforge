/**
 * Inline spinner for TTY: rotating frame with optional prefix.
 * Used by plan (loading) and doctor (response wait). Call start() before async work,
 * stop() or clear() when done (stop clears the line; clear() only clears for custom content).
 */

import readline from "readline";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export interface SpinnerOptions {
  /** Text before the spinning character (dimmed). Default "Loading... ". */
  prefix?: string;
  /** Frame interval in ms. Default 80. */
  intervalMs?: number;
  /** Output stream. Default process.stdout. */
  stream?: NodeJS.WritableStream;
  /** Only start when stream is TTY. Default true. */
  onlyWhenTty?: boolean;
}

export interface Spinner {
  start(): void;
  stop(): void;
  /** Clear the current line (e.g. before writing final content on the same line). */
  clear(): void;
}

export function createSpinner(options?: SpinnerOptions): Spinner {
  const stream = (options?.stream ?? process.stdout) as NodeJS.WritableStream & { isTTY?: boolean };
  const prefix = options?.prefix ?? "Loading... ";
  const intervalMs = options?.intervalMs ?? 80;
  const onlyWhenTty = options?.onlyWhenTty ?? true;

  let intervalId: ReturnType<typeof setInterval> | null = null;

  const clear = () => {
    if (stream === process.stdout && process.stdout.isTTY) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    }
  };

  return {
    start() {
      if (onlyWhenTty && !stream.isTTY) return;
      let idx = 0;
      intervalId = setInterval(() => {
        clear();
        stream.write(`${DIM}${prefix}${RESET}${SPINNER_FRAMES[idx % SPINNER_FRAMES.length]}`);
        idx++;
      }, intervalMs);
    },
    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      clear();
    },
    clear,
  };
}
