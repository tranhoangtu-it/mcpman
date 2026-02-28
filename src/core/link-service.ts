/**
 * link-service.ts
 * Detects local MCP server metadata from package.json or pyproject.toml
 * and registers the server in client configs + lockfile with source "local".
 * No file copying — just registers the absolute path.
 */

import fs from "node:fs";
import path from "node:path";
import type { ClientHandler } from "../clients/types.js";
import { addEntry, readLockfile } from "./lockfile.js";
import type { LockEntry } from "./lockfile.js";

export interface LinkResult {
  name: string;
  version: string;
  command: string;
  args: string[];
  envVars: string[];
  absolutePath: string;
  runtime: "node" | "python";
}

/**
 * Detect MCP server metadata from a local directory.
 * Checks for package.json (Node) then pyproject.toml (Python).
 * Throws if neither is found or directory does not exist.
 */
export function detectLocalServer(dir: string): LinkResult {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    return detectNodeServer(dir, pkgPath);
  }

  const pyprojectPath = path.join(dir, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    return detectPythonServer(dir, pyprojectPath);
  }

  throw new Error(
    `No package.json or pyproject.toml found in '${dir}'. Is this an MCP server project?`,
  );
}

// ── Node detection ─────────────────────────────────────────────────────────────

function detectNodeServer(dir: string, pkgPath: string): LinkResult {
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;

  const name = String(pkg.name ?? path.basename(dir));
  const version = String(pkg.version ?? "0.0.0");

  // Resolve entry point: bin field > main field > src/index.ts
  let entryPoint: string | null = null;

  if (pkg.bin) {
    if (typeof pkg.bin === "string") {
      entryPoint = path.resolve(dir, pkg.bin);
    } else if (typeof pkg.bin === "object" && pkg.bin !== null) {
      const binObj = pkg.bin as Record<string, string>;
      const firstBin = Object.values(binObj)[0];
      if (firstBin) entryPoint = path.resolve(dir, firstBin);
    }
  }

  if (!entryPoint && pkg.main) {
    entryPoint = path.resolve(dir, String(pkg.main));
  }

  if (!entryPoint) {
    // Fallback: look for src/index.ts or src/index.js
    const candidates = ["src/index.ts", "src/index.js", "index.ts", "index.js"];
    for (const c of candidates) {
      const candidate = path.join(dir, c);
      if (fs.existsSync(candidate)) {
        entryPoint = candidate;
        break;
      }
    }
  }

  if (!entryPoint) {
    throw new Error(`Cannot determine entry point for Node server in '${dir}'.`);
  }

  // Use tsx for TypeScript sources to avoid compile step
  const isTs = entryPoint.endsWith(".ts");
  const command = isTs ? "npx" : "node";
  const args = isTs ? ["tsx", entryPoint] : [entryPoint];

  // Extract env var names from mcp field
  const mcpField = pkg.mcp as Record<string, unknown> | undefined;
  const envVars: string[] = [];
  if (mcpField?.env && Array.isArray(mcpField.env)) {
    for (const e of mcpField.env) {
      if (typeof e === "string") envVars.push(e);
      else if (typeof e === "object" && e !== null && "name" in e) {
        envVars.push(String((e as Record<string, unknown>).name));
      }
    }
  }

  return { name, version, command, args, envVars, absolutePath: dir, runtime: "node" };
}

// ── Python detection ───────────────────────────────────────────────────────────

function detectPythonServer(dir: string, pyprojectPath: string): LinkResult {
  const raw = fs.readFileSync(pyprojectPath, "utf-8");

  // Minimal TOML parsing for name/version (avoid external dep)
  const name = extractTomlValue(raw, "name") ?? path.basename(dir);
  const version = extractTomlValue(raw, "version") ?? "0.0.0";

  // Detect python command: prefer venv if present
  let pythonCmd = "python3";
  const venvPython = path.join(dir, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    pythonCmd = venvPython;
  }

  // Entry point: look for main.py or <name>/main.py or __main__.py
  const entryCandidate = [
    path.join(dir, "main.py"),
    path.join(dir, name.replace(/-/g, "_"), "main.py"),
    path.join(dir, "__main__.py"),
  ].find((p) => fs.existsSync(p));

  const entryPoint = entryCandidate ?? path.join(dir, "main.py");

  return {
    name,
    version,
    command: pythonCmd,
    args: [entryPoint],
    envVars: [],
    absolutePath: dir,
    runtime: "python",
  };
}

/** Minimal TOML value extractor for simple string fields */
function extractTomlValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match ? match[1] : null;
}

// ── Registration ───────────────────────────────────────────────────────────────

/**
 * Register a linked server in all provided client handlers and the lockfile.
 * Lockfile entry uses source "local" and resolved = absolute path.
 */
export async function registerLinkedServer(
  linkResult: LinkResult,
  clients: ClientHandler[],
  lockfilePath?: string,
  nameOverride?: string,
): Promise<string[]> {
  const serverName = nameOverride ?? linkResult.name;
  const registered: string[] = [];

  for (const client of clients) {
    try {
      await client.addServer(serverName, {
        command: linkResult.command,
        args: linkResult.args,
      });
      registered.push(client.type);
    } catch {
      // Skip clients that fail (e.g., not installed)
    }
  }

  const lockEntry: LockEntry = {
    version: linkResult.version,
    source: "local",
    resolved: linkResult.absolutePath,
    integrity: "local",
    runtime: linkResult.runtime,
    command: linkResult.command,
    args: linkResult.args,
    envVars: linkResult.envVars,
    installedAt: new Date().toISOString(),
    clients: registered as import("../clients/types.js").ClientType[],
  };

  // Read existing lockfile to preserve other entries
  const existing = readLockfile(lockfilePath);
  existing.servers[serverName] = lockEntry;

  const { writeLockfile } = await import("./lockfile.js");
  writeLockfile(existing, lockfilePath);

  return registered;
}
