// The git pre-commit hook that `compass hook` and `compass init --hook` install.
//
// On Windows, `npx` and `npm` are bash scripts (`#!/usr/bin/env bash`). GitHub Desktop runs hooks
// with a cut-down Git that has `sh` but no `bash`, so `env` finds the next bash on the PATH, which
// is usually WSL's (C:\Windows\System32\bash.exe). WSL cannot see the Windows path it is handed and
// every commit fails with `/bin/bash: C:/.../npx: No such file or directory`.
//
// When npm's own entry points sit next to `node` (the Windows layout), the hook runs them with
// `node` directly, so no bash is involved. Elsewhere `npx` and `npm` are used as normal.
export function hookScript(lintCommand) {
  return [
    '#!/bin/sh',
    '# compass: block a commit while the orientation store has errors',
    '# On Windows, run npx and npm through node, so no bash is needed (GitHub Desktop has none).',
    'n="$(command -v node)"; d="$(dirname "$n")/node_modules/npm/bin"',
    'if [ -n "$n" ] && [ -f "$d/npx-cli.js" ]; then',
    '  npx() { "$n" "$d/npx-cli.js" "$@"; }',
    '  npm() { "$n" "$d/npm-cli.js" "$@"; }',
    'fi',
    `${lintCommand} || { echo "Compass lint failed: fix the store, or run compass sync"; exit 1; }`,
    '',
  ].join('\n')
}
