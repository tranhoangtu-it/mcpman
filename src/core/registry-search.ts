// Registry search: npm and Smithery MCP package discovery

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
  version: string;
  runtime: string;
}

const SEARCH_TIMEOUT_MS = 10_000;

// Search npm registry for MCP-related packages
export async function searchNpm(query: string, limit = 20): Promise<NpmSearchResult[]> {
  const cap = Math.min(limit, 100);
  const url = `https://registry.npmjs.org/-/v1/search?text=mcp+${encodeURIComponent(query)}&size=${cap}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return [];

    const data = await res.json() as Record<string, unknown>;
    const objects = Array.isArray(data["objects"]) ? data["objects"] : [];

    return objects.map((obj: Record<string, unknown>) => {
      const pkg = (obj["package"] ?? {}) as Record<string, unknown>;
      const dl = (obj["downloads"] as Record<string, unknown> | undefined);
      return {
        name: typeof pkg["name"] === "string" ? pkg["name"] : "",
        description: typeof pkg["description"] === "string" ? pkg["description"] : "",
        version: typeof pkg["version"] === "string" ? pkg["version"] : "",
        date: typeof pkg["date"] === "string" ? pkg["date"] : "",
        downloads: typeof dl?.["weekly"] === "number" ? dl["weekly"] : 0,
        keywords: Array.isArray(pkg["keywords"]) ? pkg["keywords"] as string[] : [],
      };
    }).filter((r) => r.name !== "");
  } catch {
    return [];
  }
}

// Search Smithery registry for MCP servers (best effort — returns [] on any failure)
export async function searchSmithery(query: string, limit = 20): Promise<SmitherySearchResult[]> {
  const cap = Math.min(limit, 100);
  const url = `https://api.smithery.ai/v1/servers?q=${encodeURIComponent(query)}&limit=${cap}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!res.ok) return [];

    const data = await res.json() as Record<string, unknown>;
    const servers = Array.isArray(data["servers"]) ? data["servers"] : [];

    return servers.map((s: Record<string, unknown>) => ({
      name: typeof s["name"] === "string" ? s["name"] : "",
      description: typeof s["description"] === "string" ? s["description"] : "",
      version: typeof s["version"] === "string" ? s["version"] : "latest",
      runtime: typeof s["runtime"] === "string" ? s["runtime"] : "node",
    })).filter((r) => r.name !== "");
  } catch {
    return [];
  }
}
