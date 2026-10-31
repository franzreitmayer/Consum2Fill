// Removes .worktrees/T-<id> and keeps its branch. `git worktree remove` alone fails on Windows
// because of the junctions in pnpm's node_modules.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const id = process.argv[2] ?? "";
if (!/^T-[\w-]+$/.test(id)) {
  console.error("Usage: node scripts/remove-worktree.mjs T-<id>");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const dir = path.resolve(".worktrees", id);
if (!existsSync(dir)) {
  console.error(`${dir} does not exist`);
  process.exit(1);
}

const registered = git("worktree", "list", "--porcelain")
  .split("\n")
  .some((line) => line.startsWith("worktree ") && path.resolve(line.slice(9)) === dir);
if (registered && git("-C", dir, "status", "--porcelain").trim() !== "") {
  console.error(`${id} has uncommitted changes, nothing removed`);
  process.exit(1);
}

rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
git("worktree", "prune");
console.log(`Removed ${dir}, branch ${id} is kept`);
