# mcpman

[![SafeSkill 55/100](https://img.shields.io/badge/SafeSkill-55%2F100_Use%20with%20Caution-orange)](https://safeskill.dev/scan/tranhoangtu-it-mcpman)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white)

Universal package manager for Model Context Protocol (MCP) servers. Install and manage MCP servers across 10+ AI clients from a single CLI.

## Supported Clients

- Claude Desktop
- VS Code (Copilot)
- Cursor
- Windsurf
- Zed
- And more...

## Installation

```bash
npm install -g mcpman
```

## Usage

```bash
# Install an MCP server
mcpman install @anthropic/mcp-server-filesystem

# List installed servers
mcpman list

# Remove a server
mcpman remove @anthropic/mcp-server-filesystem

# Show status
mcpman status
```

## How It Works

mcpman detects installed AI clients and manages their MCP server configurations automatically. It handles config file locations, server startup, and version management for each client.

## License

See [LICENSE](./LICENSE) for details.
