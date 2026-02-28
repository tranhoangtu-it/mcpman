/**
 * completions.ts
 * Generate shell completion scripts for bash, zsh, and fish.
 * Hidden flags --list-commands and --list-servers support dynamic completion.
 * Usage: mcpman completions bash >> ~/.bashrc
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineCommand } from "citty";
import pc from "picocolors";
import {
  generateBashCompletion,
  generateFishCompletion,
  generateZshCompletion,
  getCommandList,
  getServerNames,
} from "../core/completion-generator.js";

export default defineCommand({
  meta: {
    name: "completions",
    description: "Generate shell completion scripts (bash, zsh, fish)",
  },
  args: {
    shell: {
      type: "positional",
      description: "Shell: bash, zsh, fish, or install",
      required: false,
    },
    "list-commands": {
      type: "boolean",
      description: "Output all command names (used by completion scripts)",
      default: false,
    },
    "list-servers": {
      type: "boolean",
      description: "Output server names from lockfile (used by completion scripts)",
      default: false,
    },
  },
  async run({ args }) {
    // Hidden flags for dynamic completion — fast path, no formatting
    if (args["list-commands"]) {
      console.log(getCommandList().join("\n"));
      return;
    }

    if (args["list-servers"]) {
      console.log(getServerNames().join("\n"));
      return;
    }

    const shell = args.shell as string | undefined;

    if (!shell) {
      printUsage();
      return;
    }

    switch (shell.toLowerCase()) {
      case "bash":
        process.stdout.write(generateBashCompletion());
        break;

      case "zsh":
        process.stdout.write(generateZshCompletion());
        break;

      case "fish":
        process.stdout.write(generateFishCompletion());
        break;

      case "install":
        await installCompletion();
        break;

      default:
        console.error(pc.red(`  Error: Unknown shell '${shell}'. Use: bash, zsh, or fish.`));
        process.exit(1);
    }
  },
});

function printUsage(): void {
  console.log(pc.bold("\n  mcpman completions — Shell completion setup\n"));
  console.log("  Usage:");
  console.log(`    ${pc.cyan("mcpman completions bash")}    Output bash completion script`);
  console.log(`    ${pc.cyan("mcpman completions zsh")}     Output zsh completion script`);
  console.log(`    ${pc.cyan("mcpman completions fish")}    Output fish completion script`);
  console.log(`    ${pc.cyan("mcpman completions install")} Auto-detect shell and install\n`);
  console.log("  Quick setup:");
  console.log(`    ${pc.dim("# bash")}`);
  console.log(`    ${pc.cyan("source <(mcpman completions bash)")}`);
  console.log(`    ${pc.dim("# zsh")}`);
  console.log(`    ${pc.cyan("source <(mcpman completions zsh)")}\n`);
}

async function installCompletion(): Promise<void> {
  const shellBin = process.env.SHELL ?? "";
  let detectedShell = "";

  if (shellBin.includes("zsh")) detectedShell = "zsh";
  else if (shellBin.includes("fish")) detectedShell = "fish";
  else if (shellBin.includes("bash")) detectedShell = "bash";

  if (!detectedShell) {
    console.error(pc.red("  Could not detect shell from $SHELL. Run manually:"));
    console.error(pc.dim("    source <(mcpman completions bash|zsh|fish)"));
    process.exit(1);
  }

  const home = os.homedir();
  let rcFile: string;
  let script: string;

  if (detectedShell === "zsh") {
    rcFile = path.join(home, ".zshrc");
    script = generateZshCompletion();
  } else if (detectedShell === "fish") {
    const fishDir = path.join(home, ".config", "fish", "completions");
    fs.mkdirSync(fishDir, { recursive: true });
    rcFile = path.join(fishDir, "mcpman.fish");
    fs.writeFileSync(rcFile, generateFishCompletion(), "utf-8");
    console.log(pc.green(`  Installed fish completions to ${rcFile}`));
    return;
  } else {
    rcFile = path.join(home, ".bashrc");
    script = generateBashCompletion();
  }

  const marker = "# mcpman completions";
  let existing = "";
  try {
    existing = fs.readFileSync(rcFile, "utf-8");
  } catch {
    // File may not exist yet — will create
  }

  if (existing.includes(marker)) {
    console.log(pc.yellow(`  Completions already installed in ${rcFile}. Skipping.`));
    return;
  }

  fs.appendFileSync(rcFile, `\n${marker}\nsource <(mcpman completions ${detectedShell})\n`);
  console.log(pc.green(`  Installed ${detectedShell} completions in ${rcFile}`));
  console.log(pc.dim(`  Restart your shell or run: source ${rcFile}`));
}
