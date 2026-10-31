// Entry point for the Makefile: old Windows make builds cannot resolve the pnpm shim themselves.
import { spawnSync } from "node:child_process";

const result = spawnSync("pnpm", process.argv.slice(2), { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
