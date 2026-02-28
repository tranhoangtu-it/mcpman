/**
 * rollback-service.test.ts
 * Unit tests for lockfile snapshot ring buffer.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evictOldSnapshots,
  listSnapshots,
  readSnapshot,
  restoreSnapshot,
  snapshotBeforeWrite,
} from "../../src/core/rollback-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcpman-rollback-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const CONTENT_A = JSON.stringify({ lockfileVersion: 1, servers: { "server-a": {} } }, null, 2);
const CONTENT_B = JSON.stringify({ lockfileVersion: 1, servers: { "server-b": {} } }, null, 2);
const CONTENT_C = JSON.stringify({ lockfileVersion: 1, servers: { "server-c": {} } }, null, 2);

// Add small delay between snapshots so filenames (timestamp-based) are unique
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── snapshotBeforeWrite ───────────────────────────────────────────────────────

describe("snapshotBeforeWrite", () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { cleanup(dir); });

  it("creates a snapshot file", async () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    expect(listSnapshots(dir)).toHaveLength(1);
  });

  it("does not duplicate when same content written twice", async () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    await sleep(5);
    snapshotBeforeWrite(CONTENT_A, dir);
    expect(listSnapshots(dir)).toHaveLength(1);
  });

  it("creates new snapshot when content changes", async () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    await sleep(5);
    snapshotBeforeWrite(CONTENT_B, dir);
    expect(listSnapshots(dir)).toHaveLength(2);
  });

  it("creates parent dir if missing", () => {
    const nested = path.join(dir, "sub", "rollback");
    snapshotBeforeWrite(CONTENT_A, nested);
    expect(fs.existsSync(nested)).toBe(true);
  });
});

// ── evictOldSnapshots ─────────────────────────────────────────────────────────

describe("evictOldSnapshots", () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { cleanup(dir); });

  it("keeps at most 5 snapshots", async () => {
    for (let i = 0; i < 7; i++) {
      snapshotBeforeWrite(`{"v":${i}}`, dir);
      await sleep(5);
    }
    expect(listSnapshots(dir).length).toBeLessThanOrEqual(5);
  });

  it("is a no-op when snapshot count is within limit", () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    expect(() => evictOldSnapshots(dir)).not.toThrow();
    expect(listSnapshots(dir)).toHaveLength(1);
  });
});

// ── listSnapshots ─────────────────────────────────────────────────────────────

describe("listSnapshots", () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { cleanup(dir); });

  it("returns empty array when no snapshots exist", () => {
    expect(listSnapshots(dir)).toEqual([]);
  });

  it("returns newest-first order (index 0 = most recent)", async () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    await sleep(5);
    snapshotBeforeWrite(CONTENT_B, dir);
    const snaps = listSnapshots(dir);
    expect(snaps[0].index).toBe(0);
    // Most recent content is CONTENT_B
    expect(readSnapshot(0, dir)).toBe(CONTENT_B);
  });

  it("each snapshot has required metadata fields", () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    const snaps = listSnapshots(dir);
    expect(snaps[0]).toHaveProperty("index");
    expect(snaps[0]).toHaveProperty("filename");
    expect(snaps[0]).toHaveProperty("sizeBytes");
  });
});

// ── readSnapshot ──────────────────────────────────────────────────────────────

describe("readSnapshot", () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { cleanup(dir); });

  it("reads snapshot content by index", () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    expect(readSnapshot(0, dir)).toBe(CONTENT_A);
  });

  it("returns null for out-of-range index", () => {
    expect(readSnapshot(99, dir)).toBeNull();
  });

  it("returns null when no snapshots exist", () => {
    expect(readSnapshot(0, dir)).toBeNull();
  });
});

// ── restoreSnapshot ───────────────────────────────────────────────────────────

describe("restoreSnapshot", () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { cleanup(dir); });

  it("writes snapshot content to target path", async () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    const target = path.join(dir, "restored.lock");
    restoreSnapshot(0, target, dir);
    expect(fs.readFileSync(target, "utf-8")).toBe(CONTENT_A);
  });

  it("returns the restored content", () => {
    snapshotBeforeWrite(CONTENT_C, dir);
    const target = path.join(dir, "lockfile.json");
    const result = restoreSnapshot(0, target, dir);
    expect(result).toBe(CONTENT_C);
  });

  it("returns null for invalid index", () => {
    const target = path.join(dir, "lockfile.json");
    expect(restoreSnapshot(99, target, dir)).toBeNull();
  });

  it("atomic write: no leftover .tmp file", () => {
    snapshotBeforeWrite(CONTENT_A, dir);
    const target = path.join(dir, "lock.json");
    restoreSnapshot(0, target, dir);
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
  });
});
