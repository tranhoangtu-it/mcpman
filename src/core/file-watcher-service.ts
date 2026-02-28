/**
 * file-watcher-service.ts
 * Watches a local MCP server's source files for changes and auto-restarts
 * the server process. Uses Node.js built-in fs.watch (recursive) — no chokidar.
 * Debounces events to avoid rapid restarts on bulk saves.
 */

import { type ChildProcess, spawn } from "node:child_process";
import fs, { type FSWatcher } from "node:fs";

export interface WatchOptions {
  /** Executable command */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables for child process */
  env: Record<string, string>;
  /** Directory to watch for changes */
  watchDir: string;
  /** File extensions to watch (without dot). Default: ts,js,json,py,mjs,cjs */
  extensions: string[];
  /** Debounce delay in milliseconds. Default: 300 */
  debounceMs: number;
  /** Clear terminal on each restart */
  clearOnRestart: boolean;
  /** Server display name for log output */
  serverName: string;
}

/** Path segments that should never trigger a restart */
const IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".pyc",
  ".egg-info",
  ".tox",
];

function shouldIgnore(filename: string): boolean {
  return IGNORE_PATTERNS.some((p) => filename.includes(p));
}

function hasWatchedExtension(filename: string, extensions: string[]): boolean {
  return extensions.some((ext) => filename.endsWith(`.${ext}`));
}

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export class ServerWatcher {
  private child: ChildProcess | null = null;
  private watcher: FSWatcher | null = null;
  private restartCount = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private options: WatchOptions | null = null;
  private stopping = false;

  /** Start watching and spawn the initial server process */
  start(options: WatchOptions): void {
    this.options = options;
    this.stopping = false;

    console.log(`\n  Watching ${options.serverName} (${options.watchDir})...`);
    console.log(`  Extensions: ${options.extensions.join(", ")}`);
    console.log(`  Debounce: ${options.debounceMs}ms\n`);

    this.spawnChild();

    // Start file watcher — recursive requires Node 20+
    try {
      this.watcher = fs.watch(options.watchDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        this.onFileChange(filename);
      });
    } catch (err) {
      console.error(
        `  Warning: Could not watch directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Gracefully stop watcher and child process */
  stop(): void {
    this.stopping = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
    }

    console.log(`\n  Stopped. (${this.restartCount} restart${this.restartCount !== 1 ? "s" : ""})`);
  }

  /** Spawn the server child process, piping its stdio to parent */
  private spawnChild(): void {
    if (!this.options) return;

    const { command, args, env, serverName, clearOnRestart } = this.options;

    if (clearOnRestart && this.restartCount > 0) {
      process.stdout.write("\x1Bc");
    }

    console.log(`  [${timestamp()}] Starting ${serverName}...`);

    this.child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });

    this.child.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(`  [stdout] ${data.toString().trimEnd()}\n`);
    });

    this.child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`  [stderr] ${data.toString().trimEnd()}\n`);
    });

    this.child.on("error", (err) => {
      console.error(`  [${timestamp()}] Error: ${err.message}`);
    });

    this.child.on("close", (code) => {
      if (!this.stopping) {
        console.log(`  [${timestamp()}] Process exited (code ${code ?? "?"})`);
      }
    });
  }

  /** Kill child process: SIGTERM first, then SIGKILL after 2s */
  async killChild(): Promise<void> {
    if (!this.child || this.child.killed) return;

    const childRef = this.child;
    return new Promise<void>((resolve) => {
      const child = childRef;

      const killTimer = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 2000);

      child.on("close", () => {
        clearTimeout(killTimer);
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  /** Debounced file change handler */
  private onFileChange(filename: string): void {
    if (!this.options) return;
    if (shouldIgnore(filename)) return;
    if (!hasWatchedExtension(filename, this.options.extensions)) return;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      this.restartCount++;
      console.log(`  [${timestamp()}] File changed: ${filename}`);
      console.log(
        `  [${timestamp()}] Restarting ${this.options?.serverName}... (restart #${this.restartCount})`,
      );
      await this.killChild();
      this.spawnChild();
    }, this.options.debounceMs);
  }

  getRestartCount(): number {
    return this.restartCount;
  }
}
