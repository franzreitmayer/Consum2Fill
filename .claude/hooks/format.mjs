// PostToolUse hook: formats the edited file with Prettier.
// Never fails the tool call: a formatting problem surfaces later in `pnpm lint`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function findRepoRoot(file) {
  let dir = path.dirname(file);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const filePath = input.tool_input?.file_path;
  if (filePath) {
    const file = path.resolve(input.cwd ?? process.cwd(), filePath);
    // The nearest root, so a file inside .worktrees/ uses that worktree's ignore file.
    const root = findRepoRoot(file);
    if (root) {
      const prettier = await import("prettier");
      const info = await prettier.getFileInfo(file, {
        ignorePath: path.join(root, ".prettierignore"),
      });
      if (!info.ignored && info.inferredParser) {
        const options = await prettier.resolveConfig(file);
        const source = readFileSync(file, "utf8");
        const formatted = await prettier.format(source, { ...options, filepath: file });
        if (formatted !== source) {
          writeFileSync(file, formatted);
        }
      }
    }
  }
} catch (error) {
  console.error(`format hook skipped: ${error.message}`);
}
process.exit(0);
