# Project Guidelines

## Tests

All test files must be placed in the `tests/` directory. Do not add test files to the project root or any other location.

## Package Manager

Bun is the only package manager for this project. Do not use npm, yarn, or pnpm.

## Build Verification

Before stating work is complete, run `bun run build` and `bun run check` to verify the application builds and passes typecheck, lint, and formatting. If either command fails, fix the errors and repeat until both pass.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint. All commit messages must follow:

```
<type>(<optional scope>): <description>
```

| Type       | Purpose                 | Version Bump |
| ---------- | ----------------------- | ------------ |
| `feat`     | New feature             | Minor        |
| `fix`      | Bug fix                 | Patch        |
| `perf`     | Performance improvement | Patch        |
| `docs`     | Documentation only      | None         |
| `chore`    | Maintenance, deps       | None         |
| `refactor` | Code restructuring      | None         |
| `test`     | Adding/fixing tests     | None         |
| `style`    | Formatting              | None         |
| `ci`       | CI/CD changes           | None         |

Breaking changes: add `!` after type (e.g. `feat!: redesign popup UI`) or include `BREAKING CHANGE:` in the commit body. This triggers a major version bump.

## Releases

Releases are automated via semantic-release. On push to `main`, the CI workflow analyzes commits since the last release, bumps the version in `manifest.json`, generates a changelog, and creates a GitHub release with the packaged zip. Do not manually edit the version in `manifest.json` or `CHANGELOG.md`.
