/**
 * plugin-loader.ts
 * Loads, validates, installs, and removes mcpman plugins.
 * Plugins are npm packages installed under ~/.mcpman/plugins/
 * and registered in config.plugins[].
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { getPluginDir } from "../utils/paths.js";
import { readConfig, writeConfig } from "./config-service.js";

// ── Plugin contract ────────────────────────────────────────────────────────

export interface PluginSearchResult {
  name: string;
  description: string;
  version: string;
}

export interface McpmanPlugin {
  /** Display name, e.g. "ollama" */
  name: string;
  /** Source prefix used in detectSource, e.g. "ollama:" */
  prefix: string;
  /** Resolve server metadata from plugin-specific input */
  resolve(input: string): Promise<PluginResolvedServer>;
  /** Optional search across plugin's registry */
  search?(query: string, limit?: number): Promise<PluginSearchResult[]>;
}

export interface PluginResolvedServer {
  name: string;
  version: string;
  description: string;
  runtime: "node" | "python" | "docker";
  command: string;
  args: string[];
  envVars: Array<{ name: string; description: string; required: boolean; default?: string }>;
  resolved: string;
}

// ── Load helpers ───────────────────────────────────────────────────────────

/** Validate that a loaded module exports a valid McpmanPlugin. */
function isValidPlugin(obj: unknown): obj is McpmanPlugin {
  if (typeof obj !== "object" || obj === null) return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p.name === "string" && typeof p.prefix === "string" && typeof p.resolve === "function"
  );
}

/**
 * Load a single plugin by package name from the plugins directory.
 * Returns null if the package is not installed or invalid.
 */
export function loadPlugin(pkg: string, pluginDir = getPluginDir()): McpmanPlugin | null {
  try {
    const requirePath = path.join(pluginDir, "node_modules", pkg);
    const pluginRequire = createRequire(path.join(pluginDir, "index.js"));
    const mod = pluginRequire(requirePath);
    const exported = mod?.default ?? mod;
    if (isValidPlugin(exported)) return exported;
    return null;
  } catch {
    return null;
  }
}

/**
 * Load all plugins registered in config.
 * Skips packages that fail to load or are invalid.
 */
export function loadAllPlugins(pluginDir = getPluginDir()): McpmanPlugin[] {
  const config = readConfig();
  const names = config.plugins ?? [];
  const plugins: McpmanPlugin[] = [];
  for (const pkg of names) {
    const plugin = loadPlugin(pkg, pluginDir);
    if (plugin) plugins.push(plugin);
  }
  return plugins;
}

// ── Install / Remove ───────────────────────────────────────────────────────

/**
 * Install a plugin npm package into ~/.mcpman/plugins/ and register in config.
 * Throws on npm install failure.
 */
export function installPluginPackage(name: string, pluginDir = getPluginDir()): void {
  fs.mkdirSync(pluginDir, { recursive: true });

  // Initialize package.json if missing
  const pkgJsonPath = path.join(pluginDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fs.writeFileSync(
      pkgJsonPath,
      JSON.stringify({ name: "mcpman-plugins", private: true }, null, 2),
    );
  }

  execSync(`npm install --prefix "${pluginDir}" ${name}`, {
    stdio: "pipe",
    timeout: 60_000,
  });

  // Register in config
  const config = readConfig();
  const plugins = config.plugins ?? [];
  if (!plugins.includes(name)) {
    config.plugins = [...plugins, name];
    writeConfig(config);
  }
}

/**
 * Uninstall a plugin npm package and deregister from config.
 */
export function removePluginPackage(name: string, pluginDir = getPluginDir()): void {
  try {
    execSync(`npm uninstall --prefix "${pluginDir}" ${name}`, {
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch {
    // Package may already be removed from disk
  }

  // Deregister from config
  const config = readConfig();
  const plugins = config.plugins ?? [];
  config.plugins = plugins.filter((p) => p !== name);
  writeConfig(config);
}

/**
 * List installed plugin package names from config.
 */
export function listPluginPackages(): string[] {
  const config = readConfig();
  return config.plugins ?? [];
}
