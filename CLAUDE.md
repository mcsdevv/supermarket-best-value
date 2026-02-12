# Project Guidelines

## Tests

All test files must be placed in the `tests/` directory. Do not add test files to the project root or any other location.

## Package Manager

Bun is the only package manager for this project. Do not use npm, yarn, or pnpm.

## Build Verification

Before stating work is complete, run `bun run build` and `bun run check` to verify the application builds and passes typecheck, lint, and formatting. If either command fails, fix the errors and repeat until both pass.
