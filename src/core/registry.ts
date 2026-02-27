import { createHash } from "node:crypto";

export interface EnvVarSpec {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface ServerMetadata {
  name: string;
  version: string;
  description: string;
  runtime: "node" | "python" | "docker";
  command: string;
  args: string[];
  envVars: EnvVarSpec[];
  resolved: string;
}

// Compute integrity hash from resolved URL (MVP approximation)
export function computeIntegrity(resolvedUrl: string): string {
  const hash = createHash("sha512").update(resolvedUrl).digest("base64");
  return `sha512-${hash}`;
}

// Resolve server metadata from Smithery registry
// Smithery API: GET https://registry.smithery.ai/servers/{name}
export async function resolveFromSmithery(name: string): Promise<ServerMetadata> {
  const url = `https://registry.smithery.ai/servers/${encodeURIComponent(name)}`;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      throw new Error(`Server '${name}' not found on Smithery registry`);
    }
    if (!res.ok) {
      throw new Error(`Smithery API error: ${res.status}`);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) throw err;
    throw new Error(
      `Cannot reach Smithery registry: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const version = typeof data.version === "string" ? data.version : "latest";
  const command = typeof data.command === "string" ? data.command : "npx";
  const args = Array.isArray(data.args) ? (data.args as string[]) : ["-y", `${name}@${version}`];
  const envVars = Array.isArray(data.envVars) ? (data.envVars as EnvVarSpec[]) : [];
  const resolved =
    typeof data.resolved === "string" ? data.resolved : `smithery:${name}@${version}`;

  return {
    name,
    version,
    description: typeof data.description === "string" ? data.description : "",
    runtime: "node",
    command,
    args,
    envVars,
    resolved,
  };
}

// Resolve server metadata from npm registry
export async function resolveFromNpm(packageName: string): Promise<ServerMetadata> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;

  let data: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) {
      throw new Error(`Package '${packageName}' not found on npm`);
    }
    if (!res.ok) {
      throw new Error(`npm registry error: ${res.status}`);
    }
    data = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) throw err;
    throw new Error(
      `Cannot reach npm registry: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const version = typeof data.version === "string" ? data.version : "latest";
  const resolved = `https://registry.npmjs.org/${packageName}/-/${packageName.replace(/^@[^/]+\//, "")}-${version}.tgz`;

  // Check for mcp field in package.json (emerging convention)
  const mcpField =
    data.mcp && typeof data.mcp === "object" ? (data.mcp as Record<string, unknown>) : null;
  const envVars: EnvVarSpec[] = mcpField?.envVars ? (mcpField.envVars as EnvVarSpec[]) : [];

  return {
    name: packageName,
    version,
    description: typeof data.description === "string" ? data.description : "",
    runtime: "node",
    command: "npx",
    args: ["-y", `${packageName}@${version}`],
    envVars,
    resolved,
  };
}

// Resolve from GitHub URL (best-effort)
export async function resolveFromGitHub(githubUrl: string): Promise<ServerMetadata> {
  // Extract owner/repo from URL: https://github.com/owner/repo
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${githubUrl}`);
  }
  const [, owner, repo] = match;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`;

  let pkgData: Record<string, unknown> = {};
  try {
    const res = await fetch(rawUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      pkgData = (await res.json()) as Record<string, unknown>;
    }
  } catch {
    // best-effort, continue with defaults
  }

  const version = typeof pkgData.version === "string" ? pkgData.version : "main";
  const name = typeof pkgData.name === "string" ? pkgData.name : `${owner}/${repo}`;

  return {
    name,
    version,
    description: typeof pkgData.description === "string" ? pkgData.description : "",
    runtime: "node",
    command: "npx",
    args: ["-y", githubUrl],
    envVars: [],
    resolved: githubUrl,
  };
}
