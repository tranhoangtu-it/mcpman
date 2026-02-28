# Contributing to mcpman

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository and clone your fork
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Install dependencies: `npm install`

## Development

```bash
npm test          # run tests in watch mode
npm run test:run  # run tests once
npm run lint      # check code style
npm run lint:fix  # auto-fix style issues
npm run build     # compile TypeScript
```

## Code Style

- **Language:** TypeScript strict mode, ES modules
- **Formatter/Linter:** [Biome](https://biomejs.dev) — run `npm run lint` before committing
- **File naming:** kebab-case with descriptive names
- **File size:** keep files under 200 lines; split when needed

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add new command
fix: correct vault decryption bug
docs: update README examples
refactor: extract shared helper
test: cover edge case in audit
chore: bump dependency version
```

No AI-generated filler in commit messages. Be concise and factual.

## Pull Requests

1. Ensure `npm run lint` and `npm run test:run` both pass
2. Keep PRs focused — one concern per PR
3. Add/update tests for new behaviour
4. Update README if the user-facing CLI changes
5. Open a PR against `main` with a clear description

## Reporting Issues

- Bug reports: include OS, Node version, and reproduction steps
- Feature requests: explain the use case, not just the solution
