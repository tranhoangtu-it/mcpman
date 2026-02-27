import {
  resolveFromSmithery,
  resolveFromNpm,
  resolveFromGitHub,
  type ServerMetadata,
} from "./registry.js";

export type SourceType = "smithery" | "npm" | "github";

export interface ServerSource {
  type: SourceType;
  input: string; // normalized name/package/url
}

// Detect source type from user input
export function detectSource(input: string): ServerSource {
  if (input.startsWith("smithery:")) {
    return { type: "smithery", input: input.slice(9) };
  }
  if (input.startsWith("https://github.com/") || input.startsWith("github.com/")) {
    return { type: "github", input: input };
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
  }
}
