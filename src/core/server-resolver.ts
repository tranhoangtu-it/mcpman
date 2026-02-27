import { loadAllPlugins } from "./plugin-loader.js";
import {
  type ServerMetadata,
  resolveFromGitHub,
  resolveFromNpm,
  resolveFromSmithery,
} from "./registry.js";

export type SourceType = "smithery" | "npm" | "github" | string;

export interface ServerSource {
  type: SourceType;
  input: string; // normalized name/package/url
}

// Detect source type from user input (checks built-ins then plugins)
export function detectSource(input: string): ServerSource {
  if (input.startsWith("smithery:")) {
    return { type: "smithery", input: input.slice(9) };
  }
  if (input.startsWith("https://github.com/") || input.startsWith("github.com/")) {
    return { type: "github", input: input };
  }

  // Check plugin prefixes
  const plugins = loadAllPlugins();
  for (const plugin of plugins) {
    if (input.startsWith(plugin.prefix)) {
      return { type: `plugin:${plugin.name}`, input: input.slice(plugin.prefix.length) };
    }
  }

  return { type: "npm", input };
}

// Parse --env KEY=VAL flags into a Record
export function parseEnvFlags(envFlags: string | string[] | undefined): Record<string, string> {
  if (!envFlags) return {};
  const flags = Array.isArray(envFlags) ? envFlags : [envFlags];
  const result: Record<string, string> = {};
  for (const flag of flags) {
    const idx = flag.indexOf("=");
    if (idx > 0) {
      result[flag.slice(0, idx)] = flag.slice(idx + 1);
    }
  }
  return result;
}

// Resolve server metadata from detected source
export async function resolveServer(input: string): Promise<ServerMetadata> {
  const source = detectSource(input);
  switch (source.type) {
    case "smithery":
      return resolveFromSmithery(source.input);
    case "github":
      return resolveFromGitHub(source.input);
    case "npm":
      return resolveFromNpm(source.input);
    default: {
      // Plugin-based resolution: type is "plugin:<name>"
      if (source.type.startsWith("plugin:")) {
        const pluginName = source.type.slice(7);
        const plugins = loadAllPlugins();
        const plugin = plugins.find((p) => p.name === pluginName);
        if (plugin) {
          const resolved = await plugin.resolve(source.input);
          return resolved as ServerMetadata;
        }
      }
      throw new Error(`Unknown source type: ${source.type}`);
    }
  }
}
