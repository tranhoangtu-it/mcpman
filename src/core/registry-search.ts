// Registry search: npm, Smithery, and plugin-based MCP package discovery

import { type PluginSearchResult, loadAllPlugins } from "./plugin-loader.js";

export interface NpmSearchResult {
  name: string;
  description: string;
  version: string;
  date: string;
  downloads?: number;
  keywords: string[];
}

export interface SmitherySearchResult {
  name: string;
  description: string;
  useCount: number;
  verified: boolean;
  homepage: string;
}

const SEARCH_TIMEOUT_MS = 10_000;

// Search npm registry for MCP-related packages
export async function searchNpm(query: string, limit = 20): Promise<NpmSearchResult[]> {
  const cap = Math.min(limit, 100);
  const url = `https://registry.npmjs.org/-/v1/search?text=mcp+${encodeURIComponent(query)}&size=${cap}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, unknown>;
    const objects = Array.isArray(data.objects) ? data.objects : [];

    return objects
      .map((obj: Record<string, unknown>) => {
        const pkg = (obj.package ?? {}) as Record<string, unknown>;
        const dl = obj.downloads as Record<string, unknown> | undefined;
        return {
          name: typeof pkg.name === "string" ? pkg.name : "",
          description: typeof pkg.description === "string" ? pkg.description : "",
          version: typeof pkg.version === "string" ? pkg.version : "",
          date: typeof pkg.date === "string" ? pkg.date : "",
          downloads: typeof dl?.weekly === "number" ? dl.weekly : 0,
          keywords: Array.isArray(pkg.keywords) ? (pkg.keywords as string[]) : [],
        };
      })
      .filter((r) => r.name !== "");
  } catch {
    return [];
  }
}

// Search Smithery registry for MCP servers (best effort — returns [] on any failure)
// Real API: GET https://registry.smithery.ai/servers?q=<query>&pageSize=<limit>
export async function searchSmithery(query: string, limit = 20): Promise<SmitherySearchResult[]> {
  const cap = Math.min(limit, 100);
  const url = `https://registry.smithery.ai/servers?q=${encodeURIComponent(query)}&pageSize=${cap}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return [];

    const data = (await res.json()) as Record<string, unknown>;
    const servers = Array.isArray(data.servers) ? data.servers : [];

    return servers
      .map((s: Record<string, unknown>) => ({
        name: typeof s.qualifiedName === "string" ? s.qualifiedName : "",
        description: typeof s.description === "string" ? s.description : "",
        useCount: typeof s.useCount === "number" ? s.useCount : 0,
        verified: s.verified === true,
        homepage: typeof s.homepage === "string" ? s.homepage : "",
      }))
      .filter((r) => r.name !== "");
  } catch {
    return [];
  }
}

// Re-export PluginSearchResult for consumers
export type { PluginSearchResult } from "./plugin-loader.js";

// Search all loaded plugins that expose a search() method
export async function searchPlugins(
  query: string,
  limit = 20,
): Promise<Array<PluginSearchResult & { source: string }>> {
  const plugins = loadAllPlugins();
  const results: Array<PluginSearchResult & { source: string }> = [];

  for (const plugin of plugins) {
    if (typeof plugin.search !== "function") continue;
    try {
      const hits = await plugin.search(query, limit);
      for (const hit of hits) {
        results.push({ ...hit, source: plugin.name });
      }
    } catch {
      // Skip failing plugins
    }
  }

  return results.slice(0, limit);
}
