// The git pre-commit hook that `compass hook` and `compass init --hook` install.
//
// GitHub Desktop on Windows can run hooks in WSL's bash while passing the Windows PATH, so the lint
// command's tool (npx, npm, node) resolves to a Windows path that does not exist there, and every
// commit fails. When the tool does not resolve to an executable, the hook puts the system's own bin
// folders first. Everywhere else the check passes and the PATH is left alone.
export function hookScript(lintCommand) {
  const tool = lintCommand.trim().split(/\s+/)[0]
  return [
    '#!/bin/sh',
    '# compass: block a commit while the orientation store has errors',
    "# If the lint's tool is not a real executable here (GitHub Desktop running the hook in WSL with",
    "# the Windows PATH), use the system's own bin folders first.",
    `t="$(command -v ${tool})"; [ -n "$t" ] && [ -x "$t" ] || PATH="/usr/local/bin:/usr/bin:/bin:$PATH"`,
    `${lintCommand} || { echo "Compass lint failed: fix the store, or run compass sync"; exit 1; }`,
    '',
  ].join('\n')
}
