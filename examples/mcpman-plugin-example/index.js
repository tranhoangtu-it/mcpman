/**
 * mcpman-plugin-example
 * Demonstrates how to build a mcpman plugin for a custom registry.
 * Implements the McpmanPlugin interface: { name, prefix, resolve(), search?() }
 */

/** @type {import('../../src/core/plugin-loader').McpmanPlugin} */
module.exports = {
  name: "example",
  prefix: "example:",

  async resolve(input) {
    return {
      name: `example-${input}`,
      version: "1.0.0",
      description: `Example server: ${input}`,
      runtime: "node",
      command: "npx",
      args: ["-y", `example-mcp-${input}@latest`],
      envVars: [],
      resolved: `example:${input}@1.0.0`,
    };
  },

  async search(query, limit = 10) {
    // Mock search results for demonstration
    const mockServers = [
      { name: "example-hello", description: "Hello world MCP server", version: "1.0.0" },
      { name: "example-math", description: "Math operations MCP server", version: "2.1.0" },
      { name: "example-weather", description: "Weather data MCP server", version: "0.3.0" },
    ];

    return mockServers
      .filter((s) => s.name.includes(query) || s.description.includes(query))
      .slice(0, limit);
  },
};
