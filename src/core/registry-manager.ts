/**
 * registry-manager.ts
 * CRUD operations for custom registry URLs stored in ~/.mcpman/config.json.
 * Built-in registries (npm, smithery) are always present and cannot be removed.
 * Custom registries are stored in the "registries" config key.
 */

import { readConfig, writeConfig } from "./config-service.js";

export interface RegistryEntry {
  name: string;
  url: string;
  builtin: boolean;
}

const BUILTIN_REGISTRIES: RegistryEntry[] = [
  { name: "npm", url: "https://registry.npmjs.org", builtin: true },
  { name: "smithery", url: "https://registry.smithery.ai", builtin: true },
];

/** Validate URL format using the URL constructor — throws on invalid */
function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(
      `Invalid URL: "${url}". Must be a valid URL (e.g. https://registry.example.com)`,
    );
  }
}

/** Read custom registries from config (excludes builtins) */
function readCustomRegistries(configPath?: string): RegistryEntry[] {
  const config = readConfig(configPath);
  const raw = (config as Record<string, unknown>).registries;
  if (!Array.isArray(raw)) return [];
  return (raw as RegistryEntry[]).filter((r) => !r.builtin);
}

/** Write custom registries back to config */
function writeCustomRegistries(entries: RegistryEntry[], configPath?: string): void {
  const config = readConfig(configPath);
  (config as Record<string, unknown>).registries = entries;
  writeConfig(config, configPath);
}

/** Return all registries: builtins first, then custom entries */
export function getRegistries(configPath?: string): RegistryEntry[] {
  const custom = readCustomRegistries(configPath);
  return [...BUILTIN_REGISTRIES, ...custom];
}

/** Add a custom registry. Throws on duplicate name or invalid URL. */
export function addRegistry(name: string, url: string, configPath?: string): void {
  validateUrl(url);

  const all = getRegistries(configPath);
  if (all.some((r) => r.name === name)) {
    throw new Error(`Registry '${name}' already exists. Use a different name or remove it first.`);
  }

  const custom = readCustomRegistries(configPath);
  custom.push({ name, url, builtin: false });
  writeCustomRegistries(custom, configPath);
}

/** Remove a custom registry by name. Throws when attempting to remove builtins. */
export function removeRegistry(name: string, configPath?: string): void {
  if (BUILTIN_REGISTRIES.some((r) => r.name === name)) {
    throw new Error(`Cannot remove built-in registry '${name}'.`);
  }

  const custom = readCustomRegistries(configPath);
  const idx = custom.findIndex((r) => r.name === name);
  if (idx === -1) {
    throw new Error(`Registry '${name}' not found.`);
  }

  custom.splice(idx, 1);
  writeCustomRegistries(custom, configPath);
}

/** Set the default registry. Name must exist (builtin or custom). */
export function setDefaultRegistry(name: string, configPath?: string): void {
  const all = getRegistries(configPath);
  if (!all.some((r) => r.name === name)) {
    throw new Error(
      `Registry '${name}' not found. Add it first with: mcpman registry add ${name} <url>`,
    );
  }

  const config = readConfig(configPath);
  (config as Record<string, unknown>).defaultRegistry = name;
  writeConfig(config, configPath);
}

/** Get current default registry name. Fallback: "npm". */
export function getDefaultRegistry(configPath?: string): string {
  const config = readConfig(configPath);
  return String((config as Record<string, unknown>).defaultRegistry ?? "npm");
}
