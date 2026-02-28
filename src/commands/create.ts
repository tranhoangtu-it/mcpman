/**
 * create.ts
 * Scaffold a new MCP server project with Node (TypeScript) or Python boilerplate.
 * Like `npm init` but for MCP servers — generates package.json with mcp field,
 * source files, and config. No network calls; pure template generation.
 */

import path from "node:path";
import { defineCommand } from "citty";
import pc from "picocolors";
import {
  generateNodeProject,
  generatePythonProject,
  sanitizeName,
  writeScaffold,
} from "../core/scaffold-service.js";

export default defineCommand({
  meta: {
    name: "create",
    description: "Scaffold a new MCP server project",
  },
  args: {
    name: {
      type: "positional",
      description: "Project name",
      required: false,
    },
    runtime: {
      type: "string",
      description: "Runtime: node or python (default: node)",
      alias: "r",
    },
    description: {
      type: "string",
      description: "Project description",
      alias: "d",
    },
    yes: {
      type: "boolean",
      description: "Accept all defaults, skip prompts",
      alias: "y",
      default: false,
    },
  },
  async run({ args }) {
    // Resolve name — required either via positional arg or prompt
    let projectName = (args.name as string | undefined) ?? "";
    let projectDescription = (args.description as string | undefined) ?? "";
    let runtime = (args.runtime as string | undefined) ?? "node";
    const acceptDefaults = args.yes as boolean;

    // Interactive prompts when not using --yes and values missing
    if (!acceptDefaults) {
      if (!projectName) {
        // Read name interactively via stdin if available, else error
        const readline = await import("node:readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        projectName = await new Promise<string>((resolve) => {
          rl.question(pc.cyan("  Project name: "), (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });
      }

      if (!projectDescription) {
        const readline = await import("node:readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        projectDescription = await new Promise<string>((resolve) => {
          rl.question(pc.cyan("  Description (optional): "), (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });
      }

      if (!args.runtime) {
        const readline = await import("node:readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question(pc.cyan("  Runtime [node/python] (default: node): "), (a) => {
            rl.close();
            resolve(a.trim() || "node");
          });
        });
        runtime = answer;
      }
    }

    // Validate and sanitize inputs
    if (!projectName) {
      console.error(pc.red("  Error: Project name is required."));
      process.exit(1);
    }

    const sanitized = sanitizeName(projectName);
    if (!sanitized) {
      console.error(pc.red(`  Error: Invalid project name '${projectName}'.`));
      process.exit(1);
    }

    if (runtime !== "node" && runtime !== "python") {
      console.error(pc.red(`  Error: Unknown runtime '${runtime}'. Use node or python.`));
      process.exit(1);
    }

    // Generate files
    const options = {
      name: sanitized,
      description: projectDescription || `${sanitized} MCP server`,
      runtime: runtime as "node" | "python",
      transport: "stdio" as const,
    };

    const files =
      runtime === "python" ? generatePythonProject(options) : generateNodeProject(options);

    // Write to directory
    const targetDir = path.resolve(sanitized);
    try {
      writeScaffold(targetDir, files);
    } catch (err) {
      console.error(pc.red(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    // Success output
    console.log(pc.green(`\n  Created ${pc.bold(sanitized)}/\n`));
    console.log(pc.dim("  Files generated:"));
    for (const file of Object.keys(files)) {
      console.log(`    ${pc.cyan(file)}`);
    }

    console.log("\n  Next steps:");
    if (runtime === "node") {
      console.log(`    ${pc.bold(`cd ${sanitized}`)}`);
      console.log(`    ${pc.bold("npm install")}`);
      console.log(`    ${pc.bold("mcpman link .")}`);
    } else {
      console.log(`    ${pc.bold(`cd ${sanitized}`)}`);
      console.log(`    ${pc.bold("pip install -e .")}`);
      console.log(`    ${pc.bold("mcpman link .")}`);
    }
    console.log();
  },
});
