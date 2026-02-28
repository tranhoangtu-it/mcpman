/**
 * rollback-service.ts
 * Ring buffer of up to 5 lockfile snapshots at ~/.mcpman/rollback/
 * Snapshots are taken before each writeLockfile() if content changed.
 */

import fs from "node:fs";
import path from "node:path";
import { getRollbackDir } from "../utils/paths.js";

const MAX_SNAPSHOTS = 5;

export interface SnapshotMeta {
  index: number;
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** List snapshot files sorted oldest→newest (by filename timestamp prefix) */
function listSnapshotFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Take a snapshot of the lockfile content BEFORE writing.
 * Only snapshots if content differs from the most recent snapshot.
 * Evicts oldest snapshots when buffer exceeds MAX_SNAPSHOTS.
 */
export function snapshotBeforeWrite(content: string, rollbackDir?: string): void {
  const dir = rollbackDir ?? getRollbackDir();
  ensureDir(dir);

  const existing = listSnapshotFiles(dir);

  // Skip if content is identical to latest snapshot
  if (existing.length > 0) {
    const latest = existing[existing.length - 1];
    try {
      const prev = fs.readFileSync(path.join(dir, latest), "utf-8");
      if (prev === content) return;
    } catch {
      /* ignore */
    }
  }

  // Write new snapshot with timestamp filename
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${ts}.json`;
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");

  // Evict oldest snapshots to stay within ring buffer limit
  evictOldSnapshots(dir);
}

/** Remove oldest snapshots beyond MAX_SNAPSHOTS */
export function evictOldSnapshots(rollbackDir?: string): void {
  const dir = rollbackDir ?? getRollbackDir();
  const files = listSnapshotFiles(dir);
  const excess = files.length - MAX_SNAPSHOTS;
  for (let i = 0; i < excess; i++) {
    try {
      fs.unlinkSync(path.join(dir, files[i]));
    } catch {
      /* ignore */
    }
  }
}

/**
 * List available snapshots newest→oldest with metadata.
 * Index 0 = most recent snapshot.
 */
export function listSnapshots(rollbackDir?: string): SnapshotMeta[] {
  const dir = rollbackDir ?? getRollbackDir();
  const files = listSnapshotFiles(dir).reverse(); // newest first
  return files.map((filename, index) => {
    const filepath = path.join(dir, filename);
    let sizeBytes = 0;
    let createdAt = "";
    try {
      const stat = fs.statSync(filepath);
      sizeBytes = stat.size;
      createdAt = stat.mtime.toISOString();
    } catch {
      /* ignore */
    }
    return { index, filename, createdAt, sizeBytes };
  });
}

/**
 * Read snapshot content by index (0 = most recent).
 * Returns null if index is out of range.
 */
export function readSnapshot(index: number, rollbackDir?: string): string | null {
  const dir = rollbackDir ?? getRollbackDir();
  const files = listSnapshotFiles(dir).reverse(); // newest first
  const filename = files[index];
  if (!filename) return null;
  try {
    return fs.readFileSync(path.join(dir, filename), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Restore a snapshot by index to the given target lockfile path.
 * Returns the restored content, or null if snapshot not found.
 */
export function restoreSnapshot(
  index: number,
  targetPath: string,
  rollbackDir?: string,
): string | null {
  const content = readSnapshot(index, rollbackDir);
  if (content === null) return null;

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, targetPath);

  return content;
}
