import { beforeEach, describe, expect, it, vi } from "vitest";

// diagnostics.ts uses `const execAsync = promisify(exec)` at module level,
// so we must mock the entire module and replace execAsync indirectly via
// mocking node:child_process BEFORE the module is first imported.
vi.mock("node:child_process", () => {
  const execMock = vi.fn();
  return { exec: execMock };
});

import { exec } from "node:child_process";

// Helper to make exec call its callback with success or error
function stubExecSuccess(stdout: string) {
  (exec as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (_cmd: string, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: "" });
    }
  );
}

function stubExecError(msg: string) {
  (exec as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (_cmd: string, cb: (err: Error) => void) => {
      cb(new Error(msg));
    }
  );
}

import { checkEnvVars, checkRuntime } from "../../src/core/diagnostics.js";

describe("diagnostics", () => {
  beforeEach(() => {
    (exec as ReturnType<typeof vi.fn>).mockReset();
  });

  describe("checkRuntime()", () => {
    it("passes when runtime found on PATH", async () => {
      stubExecSuccess("/usr/bin/node\n");   // which node
      stubExecSuccess("v20.0.0\n");         // node --version
      const result = await checkRuntime("npx");
      expect(result.passed).toBe(true);
      expect(result.name).toBe("Runtime");
      expect(result.message).toContain("node");
    });

    it("fails when runtime not found", async () => {
      stubExecError("not found");
      const result = await checkRuntime("docker");
      expect(result.passed).toBe(false);
      expect(result.message).toContain("not found");
      expect(result.fix).toBeDefined();
    });

    it("maps npx → node for lookup", async () => {
      stubExecSuccess("/usr/local/bin/node\n");
      stubExecSuccess("v20.0.0\n");
      const result = await checkRuntime("npx");
      const calls = (exec as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0][0] as string)).toContain("node");
      expect(result.passed).toBe(true);
    });

    it("maps uvx → python3 for lookup", async () => {
      stubExecSuccess("/usr/bin/python3\n");
      stubExecSuccess("Python 3.11.0\n");
      const result = await checkRuntime("uvx");
      const calls = (exec as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0][0] as string)).toContain("python3");
      expect(result.passed).toBe(true);
    });
  });

  describe("checkEnvVars()", () => {
    it("passes with no env vars required", () => {
      const result = checkEnvVars({});
      expect(result.passed).toBe(true);
      expect(result.message).toContain("none required");
    });

    it("passes when env var is set via process.env", () => {
      vi.stubEnv("TEST_API_KEY", "real-value");
      const result = checkEnvVars({ TEST_API_KEY: "" });
      expect(result.passed).toBe(true);
      vi.unstubAllEnvs();
    });

    it("fails when required env var is missing", () => {
      const key = "MCPMAN_TEST_MISSING_XYZ_123";
      delete process.env[key];
      const result = checkEnvVars({ [key]: "" });
      expect(result.passed).toBe(false);
      expect(result.message).toContain(key);
      expect(result.fix).toContain(key);
    });

    it("passes with warning when value looks like placeholder", () => {
      vi.stubEnv("MY_TOKEN", "your-api-key-here");
      const result = checkEnvVars({ MY_TOKEN: "your-api-key-here" });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("placeholder");
      vi.unstubAllEnvs();
    });

    it("returns passing result when no env object passed", () => {
      const result = checkEnvVars(undefined);
      expect(result.passed).toBe(true);
    });

    it("counts all set vars in success message", () => {
      vi.stubEnv("KEY_A", "val-a");
      vi.stubEnv("KEY_B", "val-b");
      const result = checkEnvVars({ KEY_A: "", KEY_B: "" });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("2");
      vi.unstubAllEnvs();
    });
  });
});
