.DEFAULT_GOAL := help

# Load .env (if present) and pass its values to every command below.
-include .env
export

# Pinned by major version. Confirm the version when first run, then pin it exactly.
REDOCLY := npx --yes @redocly/cli@2

# Not a project dependency: 7.x declares a peer dependency on TypeScript 5, but the
# project is pinned to 6.0. Running it through npx keeps it out of the dependency tree.
OPENAPI_TS := npx --yes openapi-typescript@7.13.0

.PHONY: help db-up db-down migrate generate generate-check lint lint-backend lint-frontend test test-backend \
	test-frontend test-integration test-integration-local build build-backend build-frontend openapi-lint check

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

db-up: ## Start local PostgreSQL (Docker)
	docker compose up -d postgres

db-down: ## Stop local PostgreSQL (data is kept)
	docker compose down

migrate: ## Apply app and River migrations to DATABASE_URL
	cd backend && go run ./cmd/migrate

generate: ## Regenerate Go and TypeScript code from openapi.yaml
	cd backend && go generate ./internal/api
	cd frontend && $(OPENAPI_TS) ../openapi.yaml -o src/lib/api/schema.d.ts

# For CI: fails if regenerating changes the committed generated files.
generate-check: generate ## Fail if generated code is stale
	git diff --exit-code -- backend/internal/api frontend/src/lib/api

lint: lint-backend lint-frontend ## Lint backend and frontend

lint-backend: ## gofmt check and go vet
	@test -z "$$(gofmt -l backend)" || (echo "gofmt needed on:"; gofmt -l backend; exit 1)
	cd backend && go vet ./... && go vet -tags integration ./...

lint-frontend: ## ESLint
	cd frontend && npm run lint

test: test-backend test-frontend ## Unit tests (no Docker needed)

test-backend: ## Go unit tests (integration tests are excluded by build tag)
	cd backend && go test ./...

test-frontend: ## Vitest
	cd frontend && npm test

test-integration: ## Go integration tests (needs Docker; run manually)
	cd backend && go test -tags integration ./...

build: build-backend build-frontend ## Build backend and frontend

build-backend: ## go build
	cd backend && go build ./...

build-frontend: ## Typecheck and Vite build
	cd frontend && npm run build

openapi-lint: ## Lint openapi.yaml
	$(REDOCLY) lint openapi.yaml

test-integration-local: ## Go integration tests on a local PostgreSQL, no Docker (cloud sessions)
	./scripts/test-integration-local.sh

# What an agent runs before pushing. Integration tests are not part of this.
check: lint test build openapi-lint ## lint + test + build + openapi-lint
