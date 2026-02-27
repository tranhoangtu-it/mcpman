import { defineCommand } from "citty";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { searchNpm, searchPlugins, searchSmithery } from "../core/registry-search.js";
import type { NpmSearchResult, SmitherySearchResult } from "../core/registry-search.js";

// Truncate string to max length, appending ellipsis if needed
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Pad string to fixed width (left-aligned)
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

// Highlight query substring in name using yellow color
function highlightMatch(name: string, query: string): string {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    name.slice(0, idx) +
    pc.yellow(name.slice(idx, idx + query.length)) +
    name.slice(idx + query.length)
  );
}

// Format weekly download count as readable string
function formatDownloads(n: number | undefined): string {
  if (!n) return pc.dim("—");
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// Print npm results as aligned table
function printNpmResults(results: NpmSearchResult[], query: string): void {
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length), 20);
  const verWidth = Math.max(7, ...results.map((r) => r.version.length));
  const dlWidth = 9;
  const descMax = 50;

  const header = `  ${pad("NAME", nameWidth)}  ${pad("VERSION", verWidth)}  ${pad("DOWNLOADS", dlWidth)}  DESCRIPTION`;
  console.log(pc.dim(header));
  console.log(
    pc.dim(
      `  ${"-".repeat(nameWidth)}  ${"-".repeat(verWidth)}  ${"-".repeat(dlWidth)}  ${"-".repeat(descMax)}`,
    ),
  );

  for (const r of results) {
    const name = highlightMatch(pad(r.name, nameWidth), query);
    const ver = pad(r.version, verWidth);
    const dl = pad(formatDownloads(r.downloads), dlWidth);
    const desc = truncate(r.description || pc.dim("(no description)"), descMax);
    console.log(`  ${name}  ${pc.dim(ver)}  ${dl}  ${desc}`);
  }
}

// Print Smithery results as aligned table
function printSmitheryResults(results: SmitherySearchResult[], query: string): void {
  const nameWidth = Math.max(4, ...results.map((r) => r.name.length), 20);
  const usesWidth = 8;
  const descMax = 50;

  const header = `  ${pad("NAME", nameWidth)}  ${pad("USES", usesWidth)}  DESCRIPTION`;
  console.log(pc.dim(header));
  console.log(
    pc.dim(`  ${"-".repeat(nameWidth)}  ${"-".repeat(usesWidth)}  ${"-".repeat(descMax)}`),
  );

  for (const r of results) {
    const name = highlightMatch(pad(r.name, nameWidth), query);
    const uses = pad(formatDownloads(r.useCount), usesWidth);
    const badge = r.verified ? pc.green(" ✓") : "";
    const desc = truncate(r.description || pc.dim("(no description)"), descMax);
    console.log(`  ${name}${badge}  ${uses}  ${desc}`);
  }
}

export default defineCommand({
  meta: {
    name: "search",
    description: "Search for MCP servers on npm or Smithery registry",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query",
      required: true,
    },
    registry: {
      type: "string",
      description: "Registry to search: npm or smithery (default: npm)",
      default: "npm",
    },
    limit: {
      type: "string",
      description: "Maximum number of results (default: 20, max: 100)",
      default: "20",
    },
    all: {
      type: "boolean",
      description: "Include plugin registries in search results",
      default: false,
    },
  },
  async run({ args }) {
    const query = args.query as string;
    const registry = (args.registry as string).toLowerCase();
    const limit = Math.min(Math.max(1, Number.parseInt(args.limit as string, 10) || 20), 100);

    if (registry !== "npm" && registry !== "smithery") {
      console.error(pc.red(`  Unknown registry "${registry}". Use "npm" or "smithery".`));
      process.exit(1);
    }

    const spinner = createSpinner(`Searching ${registry} for "${query}"...`).start();

    if (registry === "npm") {
      const results = await searchNpm(query, limit);
      spinner.stop();

      if (results.length === 0) {
        console.log(pc.dim(`\n  No results found for "${query}" on npm.\n`));
        return;
      }

      console.log(
        pc.bold(
          `\n  mcpman search — npm (${results.length} result${results.length !== 1 ? "s" : ""})\n`,
        ),
      );
      printNpmResults(results, query);
      console.log(pc.dim("\n  Install with: mcpman install <name>\n"));

      if (args.all) {
        await printPluginResults(query, limit);
      }
      return;
    }

    // Smithery
    const results = await searchSmithery(query, limit);
    spinner.stop();

    if (results.length === 0) {
      console.log(pc.dim(`\n  No results found for "${query}" on Smithery.\n`));
      return;
    }

    console.log(
      pc.bold(
        `\n  mcpman search — Smithery (${results.length} result${results.length !== 1 ? "s" : ""})\n`,
      ),
    );
    printSmitheryResults(results, query);
    console.log(pc.dim("\n  Install with: mcpman install <name>\n"));

    // Plugin search (append if --all flag)
    if (args.all) {
      await printPluginResults(query, limit);
    }
  },
});

// Print plugin search results
async function printPluginResults(query: string, limit: number): Promise<void> {
  const pluginResults = await searchPlugins(query, limit);
  if (pluginResults.length === 0) return;

  console.log(
    pc.bold(
      `\n  Plugins (${pluginResults.length} result${pluginResults.length !== 1 ? "s" : ""})\n`,
    ),
  );
  const nameWidth = Math.max(4, ...pluginResults.map((r) => r.name.length), 20);
  const srcWidth = Math.max(6, ...pluginResults.map((r) => r.source.length));
  const descMax = 50;

  const header = `  ${pad("NAME", nameWidth)}  ${pad("SOURCE", srcWidth)}  DESCRIPTION`;
  console.log(pc.dim(header));
  console.log(
    pc.dim(`  ${"-".repeat(nameWidth)}  ${"-".repeat(srcWidth)}  ${"-".repeat(descMax)}`),
  );

  for (const r of pluginResults) {
    const name = highlightMatch(pad(r.name, nameWidth), query);
    const src = pad(r.source, srcWidth);
    const desc = truncate(r.description || pc.dim("(no description)"), descMax);
    console.log(`  ${name}  ${pc.dim(src)}  ${desc}`);
  }
}
