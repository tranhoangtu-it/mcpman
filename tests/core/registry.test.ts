import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeIntegrity,
  resolveFromGitHub,
  resolveFromNpm,
  resolveFromSmithery,
} from "../../src/core/registry.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("registry", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("computeIntegrity()", () => {
    it("returns sha512- prefixed string", () => {
      const result = computeIntegrity("https://example.com/package.tgz");
      expect(result).toMatch(/^sha512-/);
    });

    it("is deterministic for same input", () => {
      const url = "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz";
      expect(computeIntegrity(url)).toBe(computeIntegrity(url));
    });

    it("differs for different inputs", () => {
      expect(computeIntegrity("url-a")).not.toBe(computeIntegrity("url-b"));
    });
  });

  describe("resolveFromSmithery()", () => {
    it("resolves server from Smithery registry", async () => {
      // Smithery API returns a list of servers; qualifiedName is used as name
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          servers: [
            {
              qualifiedName: "test-server",
              displayName: "Test Server",
              description: "A test server",
              useCount: 10,
              verified: true,
            },
          ],
        })
      );

      const meta = await resolveFromSmithery("test-server");
      expect(meta.name).toBe("test-server");
      expect(meta.version).toBe("latest");
      expect(meta.runtime).toBe("node");
      expect(meta.command).toBe("npx");
      expect(meta.resolved).toBe("smithery:test-server");
    });

    it("throws on 404", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 404));
      await expect(resolveFromSmithery("unknown-server")).rejects.toThrow(
        "Smithery API error"
      );
    });

    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 500));
      await expect(resolveFromSmithery("bad-server")).rejects.toThrow(
        "Smithery API error"
      );
    });

    it("uses defaults when fields are missing", async () => {
      // Returns a server entry with minimal fields; qualifiedName used as name
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          servers: [{ qualifiedName: "minimal-server" }],
        })
      );
      const meta = await resolveFromSmithery("minimal-server");
      expect(meta.version).toBe("latest");
      expect(meta.command).toBe("npx");
      expect(meta.args).toContain("minimal-server");
    });
  });

  describe("resolveFromNpm()", () => {
    it("resolves package from npm registry", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          name: "@scope/my-pkg",
          version: "2.0.0",
          description: "npm package",
        })
      );

      const meta = await resolveFromNpm("@scope/my-pkg");
      expect(meta.name).toBe("@scope/my-pkg");
      expect(meta.version).toBe("2.0.0");
      expect(meta.command).toBe("npx");
      expect(meta.args).toContain("@scope/my-pkg@2.0.0");
      expect(meta.resolved).toContain("registry.npmjs.org");
    });

    it("throws on 404", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}, 404));
      await expect(resolveFromNpm("nonexistent-pkg")).rejects.toThrow(
        "not found on npm"
      );
    });

    it("reads envVars from mcp field if present", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          name: "mcp-server",
          version: "1.0.0",
          mcp: {
            envVars: [
              { name: "API_KEY", description: "API key", required: true },
            ],
          },
        })
      );

      const meta = await resolveFromNpm("mcp-server");
      expect(meta.envVars).toHaveLength(1);
      expect(meta.envVars[0].name).toBe("API_KEY");
    });
  });

  describe("resolveFromGitHub()", () => {
    it("resolves from GitHub URL", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          name: "my-mcp-server",
          version: "0.5.0",
          description: "GitHub server",
        })
      );

      const meta = await resolveFromGitHub(
        "https://github.com/owner/my-mcp-server"
      );
      expect(meta.name).toBe("my-mcp-server");
      expect(meta.version).toBe("0.5.0");
      expect(meta.resolved).toBe("https://github.com/owner/my-mcp-server");
    });

    it("throws on invalid GitHub URL", async () => {
      await expect(
        resolveFromGitHub("https://example.com/not-github")
      ).rejects.toThrow("Invalid GitHub URL");
    });

    it("uses owner/repo as name when package.json fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

      const meta = await resolveFromGitHub(
        "https://github.com/owner/fallback-repo"
      );
      expect(meta.name).toBe("owner/fallback-repo");
      expect(meta.version).toBe("main");
    });
  });
});
