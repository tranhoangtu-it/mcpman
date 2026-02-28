/**
 * completion-generator.ts
 * Generate shell completion scripts for bash, zsh, and fish.
 * Scripts call `mcpman completions --list-commands` and
 * `mcpman completions --list-servers` at completion time for dynamic values.
 */

import { readLockfile } from "./lockfile.js";

/** All mcpman subcommands (static list — update when adding new commands) */
export function getCommandList(): string[] {
  return [
    "install",
    "list",
    "remove",
    "doctor",
    "init",
    "secrets",
    "sync",
    "audit",
    "update",
    "upgrade",
    "config",
    "search",
    "info",
    "run",
    "logs",
    "test",
    "profiles",
    "plugin",
    "export",
    "import",
    "create",
    "link",
    "watch",
    "registry",
    "completions",
    "why",
    "env",
    "bench",
    "diff",
    "group",
    "pin",
    "rollback",
  ];
}

/** Commands that take a server name as their first argument */
const SERVER_ARG_COMMANDS = [
  "run",
  "test",
  "logs",
  "watch",
  "remove",
  "update",
  "info",
  "audit",
  "link",
  "why",
];

/** Read server names from the lockfile for dynamic completion */
export function getServerNames(lockfilePath?: string): string[] {
  try {
    const data = readLockfile(lockfilePath);
    return Object.keys(data.servers);
  } catch {
    return [];
  }
}

/** Valid client types for --client flag completion */
export function getClientTypes(): string[] {
  return ["claude-desktop", "cursor", "vscode", "windsurf"];
}

// ── Bash ───────────────────────────────────────────────────────────────────────

export function generateBashCompletion(): string {
  const serverCmds = SERVER_ARG_COMMANDS.join("|");
  return `# mcpman bash completion
# Add to ~/.bashrc or ~/.bash_profile:
#   source <(mcpman completions bash)
# Or append permanently:
#   mcpman completions bash >> ~/.bashrc

_mcpman_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$(mcpman completions --list-commands 2>/dev/null)" -- "$cur"))
    return
  fi

  case "$prev" in
    ${serverCmds})
      COMPREPLY=($(compgen -W "$(mcpman completions --list-servers 2>/dev/null)" -- "$cur"))
      ;;
    --client|-c)
      COMPREPLY=($(compgen -W "claude-desktop cursor vscode windsurf" -- "$cur"))
      ;;
    --runtime|-r)
      COMPREPLY=($(compgen -W "node python" -- "$cur"))
      ;;
  esac
}

complete -F _mcpman_completions mcpman
`;
}

// ── Zsh ────────────────────────────────────────────────────────────────────────

export function generateZshCompletion(): string {
  const serverCmds = SERVER_ARG_COMMANDS.map((c) => `'${c}'`).join(" ");
  return `#compdef mcpman
# mcpman zsh completion
# Add to ~/.zshrc:
#   source <(mcpman completions zsh)
# Or use compinit:
#   mcpman completions zsh > "\${fpath[1]}/_mcpman"

_mcpman() {
  local state

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      local commands
      commands=($(mcpman completions --list-commands 2>/dev/null))
      _describe 'command' commands
      ;;
    args)
      local cmd="\${words[2]}"
      local server_cmds=(${serverCmds})
      if (( server_cmds[(I)$cmd] )); then
        local servers
        servers=($(mcpman completions --list-servers 2>/dev/null))
        _describe 'server' servers
      fi
      ;;
  esac
}

compdef _mcpman mcpman
`;
}

// ── Fish ───────────────────────────────────────────────────────────────────────

export function generateFishCompletion(): string {
  const serverCmds = SERVER_ARG_COMMANDS.join(" ");
  return `# mcpman fish completion
# Add to ~/.config/fish/completions/mcpman.fish:
#   mcpman completions fish > ~/.config/fish/completions/mcpman.fish

# Disable file completion for mcpman
complete -c mcpman -f

# Subcommand completions (dynamic)
complete -c mcpman -n '__fish_use_subcommand' \\
  -a "(mcpman completions --list-commands 2>/dev/null)"

# Server name completions for commands that take a server arg
for cmd in ${serverCmds}
  complete -c mcpman -n "__fish_seen_subcommand_from $cmd" \\
    -a "(mcpman completions --list-servers 2>/dev/null)"
end

# --client flag completions
complete -c mcpman -l client -s c \\
  -a "claude-desktop cursor vscode windsurf" \\
  -d "Target client"

# --runtime flag completions
complete -c mcpman -l runtime -s r \\
  -a "node python" \\
  -d "Runtime"
`;
}
