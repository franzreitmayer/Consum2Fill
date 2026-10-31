// PreToolUse hook for the reviewer: allows only checks and read-only git commands in Bash.
import { readFileSync } from "node:fs";

const ALLOWED = [
  /^make check$/,
  /^pnpm (check|lint|typecheck|test)$/,
  /^pnpm --filter @c2r\/(api|web|shared) (lint|typecheck|test)$/,
  /^git (status|diff|log|show)( [^;&|<>`$\r\n]*)?$/,
];

const input = JSON.parse(readFileSync(0, "utf8"));
const command = (input.tool_input?.command ?? "").trim();

// git diff/log/show can write files through --output.
const permitted = ALLOWED.some((pattern) => pattern.test(command)) && !command.includes("--output");
if (!permitted) {
  console.error(`Blocked: the reviewer may only run checks and read-only git commands: ${command}`);
  process.exit(2);
}
