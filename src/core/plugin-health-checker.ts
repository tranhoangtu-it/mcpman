/**
 * plugin-health-checker.ts
 * Validates installed plugins: loadable, prefix unique, resolve() callable.
 * Used by `mcpman doctor` to report plugin health.
 */

import { listPluginPackages, loadAllPlugins, loadPlugin } from "./plugin-loader.js";
import type { McpmanPlugin } from "./plugin-loader.js";

export interface PluginCheckResult {
  packageName: string;
  pluginName: string | null;
  prefix: string | null;
  loadable: boolean;
  prefixUnique: boolean;
  resolvable: boolean;
  error?: string;
}

export interface PluginHealthSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  results: PluginCheckResult[];
}

/**
 * Check health of all registered plugins.
 * Validates: installed on disk, valid export, unique prefix, resolve() callable.
 */
export function checkPluginHealth(pluginDir?: string): PluginHealthSummary {
  const packageNames = listPluginPackages();

  if (packageNames.length === 0) {
    return { total: 0, healthy: 0, unhealthy: 0, results: [] };
  }

  const results: PluginCheckResult[] = [];
  const seenPrefixes = new Map<string, string>();

  // First pass: load all plugins to detect prefix collisions
  const loaded = new Map<string, McpmanPlugin | null>();
  for (const pkg of packageNames) {
    const plugin = pluginDir ? loadPlugin(pkg, pluginDir) : loadPlugin(pkg);
    loaded.set(pkg, plugin);
    if (plugin) {
      if (seenPrefixes.has(plugin.prefix)) {
        // Collision detected — both will be marked non-unique
      } else {
        seenPrefixes.set(plugin.prefix, pkg);
      }
    }
  }

  // Check for duplicate prefixes
  const prefixCounts = new Map<string, number>();
  for (const [, plugin] of loaded) {
    if (plugin) {
      prefixCounts.set(plugin.prefix, (prefixCounts.get(plugin.prefix) ?? 0) + 1);
    }
  }

  // Second pass: produce results
  for (const pkg of packageNames) {
    const plugin = loaded.get(pkg) ?? null;

    if (!plugin) {
      results.push({
        packageName: pkg,
        pluginName: null,
        prefix: null,
        loadable: false,
        prefixUnique: false,
        resolvable: false,
        error: "Failed to load — package not installed or invalid export",
      });
      continue;
    }

    const prefixUnique = (prefixCounts.get(plugin.prefix) ?? 0) <= 1;
    const resolvable = typeof plugin.resolve === "function";

    const healthy = prefixUnique && resolvable;

    results.push({
      packageName: pkg,
      pluginName: plugin.name,
      prefix: plugin.prefix,
      loadable: true,
      prefixUnique,
      resolvable,
      error: !prefixUnique
        ? `Prefix "${plugin.prefix}" conflicts with another plugin`
        : !resolvable
          ? "resolve() is not a function"
          : undefined,
    });
  }

  const healthy = results.filter((r) => r.loadable && r.prefixUnique && r.resolvable).length;

  return {
    total: results.length,
    healthy,
    unhealthy: results.length - healthy,
    results,
  };
}
