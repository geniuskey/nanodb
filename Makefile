# NANoDB Core task entry points. Native targets use uv (Python) and npm
# (frontend); container targets use Docker Compose. Demo seeding and reset run
# host-side against the database and are guarded by NANODB_PROFILE=demo so they
# never touch source sample data in data/samples/.

COMPOSE ?= docker compose
UV ?= uv
NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "} {printf "  %-18s %s\n", $$1, $$2}'

# --- Setup ------------------------------------------------------------------

.PHONY: install
install: ## Install backend (uv) and frontend (npm) dependencies from locks
	$(UV) sync --frozen
	$(NPM) ci

.PHONY: build-frontend
build-frontend: ## Build the React frontend into dist/frontend
	$(NPM) run build

# --- Native run -------------------------------------------------------------

.PHONY: migrate
migrate: ## Apply database migrations to head (native)
	$(UV) run alembic upgrade head

.PHONY: dev
dev: ## Run the API with reload on loopback:8000 (native; needs a reachable DB)
	$(UV) run uvicorn nanodb.api.app:app --reload --host 127.0.0.1 --port 8000

# --- Quality gates ----------------------------------------------------------

.PHONY: lint
lint: ## Ruff lint the Python sources
	$(UV) run ruff check .

.PHONY: typecheck
typecheck: ## mypy (backend) and tsc (frontend) type checks
	$(UV) run mypy
	$(NPM) run typecheck

.PHONY: test
test: test-backend test-frontend ## Run backend and frontend unit/integration tests

.PHONY: test-backend
test-backend: ## Run the backend test suite (uv/pytest)
	$(UV) run pytest

.PHONY: test-frontend
test-frontend: ## Run the frontend unit tests (vitest)
	$(NPM) run test:frontend

.PHONY: test-e2e
test-e2e: ## Run the Playwright browser scenarios
	$(NPM) run test:e2e

# --- Demo data --------------------------------------------------------------

.PHONY: preflight
preflight: ## Offline validation of demo derivatives and manifest
	$(UV) run python scripts/preflight_demo.py

.PHONY: prepare-demo
prepare-demo: ## Regenerate demo PNG derivatives and manifest (offline)
	$(UV) run python scripts/prepare_demo_samples.py

.PHONY: seed-demo
seed-demo: ## Load demo images/measurements into the running DB (NANODB_PROFILE=demo)
	NANODB_PROFILE=demo $(UV) run python scripts/prepare_demo_samples.py --load

.PHONY: reset
reset: ## Safely reset the demo DB rows and var/uploads (NANODB_PROFILE=demo)
	NANODB_PROFILE=demo $(UV) run python scripts/reset_demo.py --yes

# --- Container stack --------------------------------------------------------

.PHONY: up
up: ## Build and start db -> migrate -> app, waiting for health
	$(COMPOSE) up --build --wait

.PHONY: demo
demo: up seed-demo ## Bring up the stack and seed demo data, then print the URL
	@echo "NANoDB Core is running at http://127.0.0.1:$${APP_PORT:-8000}"

.PHONY: stop
stop: ## Stop the stack but keep the database volume
	$(COMPOSE) stop

.PHONY: down
down: ## Stop and remove containers, keeping the database volume
	$(COMPOSE) down

.PHONY: clean
clean: ## Remove containers AND the database volume (destructive)
	$(COMPOSE) down --volumes
