/**
 * template-service.ts
 * Install templates stored at ~/.mcpman/templates/<name>.json
 * Each template: { name, description, servers: [{name, source, version, env, args}], createdAt }
 */

import fs from "node:fs";
import path from "node:path";
import { getTemplatesDir } from "../utils/paths.js";
import { readLockfile } from "./lockfile.js";

export interface TemplateServer {
  name: string;
  source: string;
  version?: string;
  env?: Record<string, string>;
  args?: string[];
}

export interface Template {
  name: string;
  description: string;
  servers: TemplateServer[];
  createdAt: string;
}

// ── I/O ───────────────────────────────────────────────────────────────────────

function templatePath(name: string, dir?: string): string {
  return path.join(dir ?? getTemplatesDir(), `${name}.json`);
}

function ensureDir(dir?: string): void {
  const target = dir ?? getTemplatesDir();
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SaveTemplateOptions {
  description?: string;
  dir?: string;
}

/** Snapshot current lockfile servers into a named template */
export function saveTemplate(name: string, opts: SaveTemplateOptions = {}): void {
  const lockfile = readLockfile();
  const servers: TemplateServer[] = Object.entries(lockfile.servers).map(([sName, entry]) => ({
    name: sName,
    source: entry.source,
    version: entry.version,
    args: entry.args,
  }));

  const template: Template = {
    name,
    description: opts.description ?? "",
    servers,
    createdAt: new Date().toISOString(),
  };

  ensureDir(opts.dir);
  fs.writeFileSync(templatePath(name, opts.dir), JSON.stringify(template, null, 2), "utf-8");
}

/** Load a named template; returns null if not found */
export function loadTemplate(name: string, dir?: string): Template | null {
  const file = templatePath(name, dir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Template;
  } catch {
    return null;
  }
}

/** List all saved template names (sorted) */
export function listTemplates(dir?: string): string[] {
  const target = dir ?? getTemplatesDir();
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Delete a named template (no-op if not found) */
export function deleteTemplate(name: string, dir?: string): void {
  const file = templatePath(name, dir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

/**
 * Generate install commands for a template (does NOT auto-install).
 * Returns array of install command strings like "mcpman install @scope/pkg@1.2.3"
 */
export function applyTemplate(name: string, dir?: string): string[] {
  const template = loadTemplate(name, dir);
  if (!template) {
    throw new Error(`Template "${name}" not found`);
  }
  return template.servers.map((s) => {
    const versionSuffix = s.version ? `@${s.version}` : "";
    return `mcpman install ${s.name}${versionSuffix}`;
  });
}
