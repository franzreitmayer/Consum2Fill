.PHONY: check dev test lint typecheck docker-dev docker-stop docker-logs docker-shell docker-check initial-data

DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.dev.yml

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

docker-dev:
	$(DEV_COMPOSE) up --build -d

docker-stop:
	$(DEV_COMPOSE) down

docker-logs:
	$(DEV_COMPOSE) logs -f app

docker-shell:
	$(DEV_COMPOSE) exec app bash

INITIAL_DATA_FILE := DIN_13232_A_B_C_Einzelartikelliste.csv

# Runs in the running app container, whether it is the production or the development image
initial-data:
	docker compose exec -T app sh -c "if [ -f dist/initialData.js ]; then node dist/initialData.js resources/data/$(INITIAL_DATA_FILE); else pnpm --filter @c2r/api exec tsx src/initialData.ts /repo/resources/data/$(INITIAL_DATA_FILE); fi"

docker-check:
	$(DEV_COMPOSE) exec app pnpm check
