/**
 * validate.ts
 * `mcpman validate` — validate lockfile and client configs against schema.
 */

import { defineCommand } from "citty";
import pc from "picocolors";
import { validateAll, validateClientConfig, validateLockfile } from "../core/config-validator.js";
import type { ValidationResult } from "../core/config-validator.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function printResult(r: ValidationResult): void {
  const icon = r.valid ? pc.green("✓") : pc.red("✗");
  const status = r.valid ? pc.green("PASS") : pc.red("FAIL");
  console.log(`  ${icon} ${pc.bold(r.file)}  ${status}`);
  if (!r.valid) {
    for (const err of r.errors) {
      console.log(`      ${pc.dim("·")} ${pc.yellow(err)}`);
    }
  }
}

// ── Command ────────────────────────────────────────────────────────────────────

export default defineCommand({
  meta: {
    name: "validate",
    description: "Validate lockfile and client configs against expected schema",
  },
  args: {
    client: {
      type: "string",
      description: "Validate a specific client config (claude-desktop, cursor, vscode, windsurf)",
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  run({ args }) {
    let results: ValidationResult[];

    if (args.client) {
      results = [validateClientConfig(args.client)];
    } else {
      results = validateAll();
    }

    if (args.json) {
      console.log(JSON.stringify(results, null, 2));
      const anyFail = results.some((r) => !r.valid);
      if (anyFail) process.exit(1);
      return;
    }

    console.log(pc.bold("\n  mcpman validate\n"));
    console.log(pc.dim(`  ${"─".repeat(60)}`));

    for (const r of results) {
      printResult(r);
    }

    console.log(pc.dim(`\n  ${"─".repeat(60)}`));

    const passed = results.filter((r) => r.valid).length;
    const failed = results.filter((r) => !r.valid).length;

    if (failed === 0) {
      console.log(`\n  ${pc.green("All files valid")} (${passed} checked)\n`);
    } else {
      console.log(
        `\n  ${pc.red(`${failed} file(s) failed`)}  ${pc.dim("·")}  ${pc.green(`${passed} passed`)}\n`,
      );
      process.exit(1);
    }
  },
});
