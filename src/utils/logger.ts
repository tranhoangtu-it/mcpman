import pc from "picocolors";

// Respect NO_COLOR env var and --no-color flag
const noColor = process.env.NO_COLOR !== undefined || process.argv.includes("--no-color");
const isVerbose = process.argv.includes("--verbose");
const isJson = process.argv.includes("--json");

function colorize(fn: (s: string) => string, text: string): string {
  return noColor ? text : fn(text);
}

export function info(message: string): void {
  if (isJson) return;
  console.log(`${colorize(pc.cyan, "i")} ${message}`);
}

export function success(message: string): void {
  if (isJson) return;
  console.log(`${colorize(pc.green, "✓")} ${message}`);
}

export function warn(message: string): void {
  if (isJson) return;
  console.warn(`${colorize(pc.yellow, "⚠")} ${message}`);
}

export function error(message: string): void {
  if (isJson) return;
  console.error(`${colorize(pc.red, "✗")} ${message}`);
}

export function debug(message: string): void {
  if (!isVerbose || isJson) return;
  console.log(`${colorize(pc.gray, "•")} ${colorize(pc.gray, message)}`);
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
