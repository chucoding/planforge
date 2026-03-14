/**
 * Shared TUI key handling for arrow-key selection (doctor, model commands).
 */

export type KeyAction = "up" | "down" | "left" | "right" | "enter" | "quit" | null;

export function waitKey(): Promise<KeyAction> {
  return new Promise((resolveKey) => {
    if (!process.stdin.isTTY) {
      resolveKey(null);
      return;
    }
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let buf = "";

    const resolveAndClean = (action: KeyAction) => {
      cleanup();
      resolveKey(action);
    };

    const onData = (chunk: string | Buffer) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const s = buf;

      if (s === "\r" || s === "\n") {
        buf = "";
        resolveAndClean("enter");
        return;
      }
      if (s === "\u0003") {
        buf = "";
        resolveAndClean("quit");
        return;
      }
      // Arrow keys: full sequence (e.g. \x1b[A) or split (\x1b then [ then A)
      if (s.startsWith("\x1b[") && s.length >= 3) {
        const c = s[2];
        buf = s.length > 3 ? s.slice(3) : "";
        if (c === "A") resolveAndClean("up");
        else if (c === "B") resolveAndClean("down");
        else if (c === "C") resolveAndClean("right");
        else if (c === "D") resolveAndClean("left");
        else resolveAndClean(null);
        return;
      }
      if (s === "\x1b" || (s.startsWith("\x1b[") && s.length < 3)) {
        return;
      }
      // Single char
      if (s.length >= 1) {
        const first = s[0];
        buf = s.slice(1);
        if (first === "w" || first === "k") resolveAndClean("up");
        else if (first === "s" || first === "j") resolveAndClean("down");
        else if (first === "a" || first === "h") resolveAndClean("left");
        else if (first === "d" || first === "l") resolveAndClean("right");
        else resolveAndClean(null);
        return;
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (!wasRaw) process.stdin.setRawMode?.(false);
    };

    process.stdin.on("data", onData);
  });
}
