.PHONY: check dev test lint typecheck

# Old Windows make builds cut "Path" at the first "\;" and pass that to child processes.
ifdef Path
export Path := $(PATH)
endif

check:
	node scripts/pnpm.mjs check

dev:
	node scripts/pnpm.mjs dev

test:
	node scripts/pnpm.mjs test

lint:
	node scripts/pnpm.mjs lint

typecheck:
	node scripts/pnpm.mjs typecheck
