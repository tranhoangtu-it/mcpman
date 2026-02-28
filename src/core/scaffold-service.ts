/**
 * scaffold-service.ts
 * Generates MCP server project files from inline templates.
 * Supports Node (TypeScript) and Python runtimes.
 * No network calls — pure template generation.
 */

import fs from "node:fs";
import path from "node:path";

export interface ScaffoldOptions {
  name: string;
  description: string;
  runtime: "node" | "python";
  transport: "stdio";
}

/** Sanitize project name: lowercase, alphanumeric + hyphens only */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Generate Node (TypeScript) project files */
export function generateNodeProject(options: ScaffoldOptions): Record<string, string> {
  const { name, description } = options;

  const packageJson = JSON.stringify(
    {
      name,
      version: "0.1.0",
      description,
      type: "module",
      bin: { [name]: "./dist/index.js" },
      main: "./dist/index.js",
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        dev: "tsx src/index.ts",
      },
      mcp: {
        name,
        description,
        transport: "stdio",
        env: [],
      },
      dependencies: {
        "@modelcontextprotocol/sdk": "^1.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
        tsx: "^4.0.0",
        "@types/node": "^20.0.0",
      },
    },
    null,
    2,
  );

  const tsconfig = JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ["src"],
    },
    null,
    2,
  );

  const indexTs = `#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "${name}", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "hello",
      description: "Say hello",
      inputSchema: { type: "object", properties: { name: { type: "string" } } },
    },
  ],
}));

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "hello") {
    const who = request.params.arguments?.name ?? "world";
    return { content: [{ type: "text", text: \`Hello, \${who}!\` }] };
  }
  throw new Error(\`Unknown tool: \${request.params.name}\`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;

  return {
    "package.json": packageJson,
    "tsconfig.json": tsconfig,
    "src/index.ts": indexTs,
  };
}

/** Generate Python project files */
export function generatePythonProject(options: ScaffoldOptions): Record<string, string> {
  const { name, description } = options;

  const pyprojectToml = `[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "${name}"
version = "0.1.0"
description = "${description}"
requires-python = ">=3.10"
dependencies = ["mcp>=1.0.0"]

[project.scripts]
${name} = "${name.replace(/-/g, "_")}:main"

[tool.mcp]
name = "${name}"
description = "${description}"
transport = "stdio"
`;

  const mainPy = `#!/usr/bin/env python3
"""${description}"""
from mcp.server import Server
from mcp.server.stdio import stdio_server

app = Server("${name}")

@app.list_tools()
async def list_tools():
    return [
        {
            "name": "hello",
            "description": "Say hello",
            "inputSchema": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
            },
        }
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "hello":
        who = arguments.get("name", "world")
        return [{"type": "text", "text": f"Hello, {who}!"}]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
`;

  return {
    "pyproject.toml": pyprojectToml,
    "main.py": mainPy,
  };
}

/**
 * Write scaffold files to target directory.
 * Creates nested directories as needed.
 * Throws if directory already exists and is non-empty.
 */
export function writeScaffold(dir: string, files: Record<string, string>): void {
  if (fs.existsSync(dir)) {
    const existing = fs.readdirSync(dir);
    if (existing.length > 0) {
      throw new Error(`Directory '${dir}' already exists and is not empty.`);
    }
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    const parentDir = path.dirname(fullPath);
    fs.mkdirSync(parentDir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
}
