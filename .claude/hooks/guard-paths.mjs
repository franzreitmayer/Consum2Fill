// PreToolUse hook for subagents: blocks Edit/Write outside the path prefixes given as arguments.
// Usage: node guard-paths.mjs apps/api packages/shared
import { readFileSync } from "node:fs";
import path from "node:path";

const allowed = process.argv.slice(2);
const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path;

if (filePath) {
  const cwd = input.cwd ?? process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const relative = path
    .relative(projectDir, path.resolve(cwd, filePath))
    .replaceAll("\\", "/")
    // Paths inside a task worktree count like the same path in the main checkout.
    .replace(/^\.worktrees\/[^/]+\//, "");

  const permitted = allowed.some((prefix) => relative.startsWith(`${prefix}/`));
  if (!permitted) {
    console.error(
      `Blocked: ${relative} is outside this agent's paths (${allowed.join(", ")}). ` +
        "Report the required change to the main session instead.",
    );
    process.exit(2);
  }
}
