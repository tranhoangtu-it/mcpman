import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch before importing modules
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// Build a minimal npm search API response object
function makeNpmObject(overrides: {
  name?: string;
  description?: string;
  version?: string;
  date?: string;
  keywords?: string[];
  weeklyDownloads?: number;
} = {}) {
  return {
    package: {
      name: overrides.name ?? "test-mcp-server",
      description: overrides.description ?? "A test MCP server",
      version: overrides.version ?? "1.2.3",
      date: overrides.date ?? "2025-01-01T00:00:00.000Z",
      keywords: overrides.keywords ?? ["mcp", "server"],
    },
    downloads: { weekly: overrides.weeklyDownloads ?? 1000 },
  };
}

// Build a minimal Smithery API response server object
function makeSmitheryServer(overrides: {
  name?: string;
  description?: string;
  version?: string;
  runtime?: string;
} = {}) {
  return {
    name: overrides.name ?? "smithery-mcp-server",
    description: overrides.description ?? "A Smithery MCP server",
    version: overrides.version ?? "0.1.0",
    runtime: overrides.runtime ?? "node",
  };
}

// ─── searchNpm ────────────────────────────────────────────────────────────────

describe("searchNpm()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("parses npm search response correctly", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      objects: [makeNpmObject({ name: "mcp-filesystem", weeklyDownloads: 5000 })],
      total: 1,
    }));

    const results = await searchNpm("filesystem");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("mcp-filesystem");
    expect(results[0].version).toBe("1.2.3");
    expect(results[0].downloads).toBe(5000);
    expect(results[0].description).toBe("A test MCP server");
  });

  it("returns multiple results", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      objects: [
        makeNpmObject({ name: "mcp-pkg-a", weeklyDownloads: 100 }),
        makeNpmObject({ name: "mcp-pkg-b", weeklyDownloads: 200 }),
        makeNpmObject({ name: "mcp-pkg-c", weeklyDownloads: 300 }),
      ],
      total: 3,
    }));

    const results = await searchNpm("pkg");
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.name)).toEqual(["mcp-pkg-a", "mcp-pkg-b", "mcp-pkg-c"]);
  });

  it("returns empty array when npm returns no objects", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({ objects: [], total: 0 }));

    const results = await searchNpm("no-such-thing-xyz");
    expect(results).toHaveLength(0);
  });

  it("returns empty array on non-ok response", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    const results = await searchNpm("error-query");
    expect(results).toHaveLength(0);
  });

  it("returns empty array on network error", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const results = await searchNpm("unreachable");
    expect(results).toHaveLength(0);
  });

  it("respects limit parameter (capped at 100)", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({ objects: [], total: 0 }));

    await searchNpm("test", 5);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("size=5");
  });

  it("caps limit at 100 even if larger value given", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({ objects: [], total: 0 }));

    await searchNpm("test", 999);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("size=100");
  });

  it("handles missing downloads field gracefully (defaults to 0)", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      objects: [{
        package: {
          name: "mcp-no-dl",
          description: "No downloads field",
          version: "0.0.1",
          date: "2025-01-01",
          keywords: [],
        },
        // no downloads field
      }],
      total: 1,
    }));

    const results = await searchNpm("no-dl");
    expect(results[0].downloads).toBe(0);
  });

  it("filters out results with empty name", async () => {
    const { searchNpm } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      objects: [
        { package: { name: "", description: "bad", version: "1.0.0", date: "", keywords: [] }, downloads: { weekly: 0 } },
        makeNpmObject({ name: "valid-mcp" }),
      ],
      total: 2,
    }));

    const results = await searchNpm("test");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("valid-mcp");
  });
});

// ─── searchSmithery ───────────────────────────────────────────────────────────

describe("searchSmithery()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("parses Smithery search response correctly", async () => {
    const { searchSmithery } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      servers: [makeSmitheryServer({ name: "brave-mcp", version: "1.0.0" })],
    }));

    const results = await searchSmithery("brave");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("brave-mcp");
    expect(results[0].version).toBe("1.0.0");
    expect(results[0].runtime).toBe("node");
  });

  it("returns empty array on API error (500)", async () => {
    const { searchSmithery } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    const results = await searchSmithery("query");
    expect(results).toHaveLength(0);
  });

  it("returns empty array on network failure", async () => {
    const { searchSmithery } = await import("../src/core/registry-search.js");

    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const results = await searchSmithery("query");
    expect(results).toHaveLength(0);
  });

  it("returns empty array when servers field is missing", async () => {
    const { searchSmithery } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({ data: [] }));

    const results = await searchSmithery("query");
    expect(results).toHaveLength(0);
  });

  it("defaults version to 'latest' when missing", async () => {
    const { searchSmithery } = await import("../src/core/registry-search.js");

    mockFetch.mockResolvedValueOnce(makeResponse({
      servers: [{ name: "no-version-server", description: "test", runtime: "node" }],
    }));

    const results = await searchSmithery("test");
    expect(results[0].version).toBe("latest");
  });
});
