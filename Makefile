.PHONY: test quality

test: ## Workflow gate 1 — build + vitest, non-interactive
	pnpm test

quality: ## Workflow gate 2 — lint, typecheck, vendored OpenAPI spec unchanged
	pnpm lint
	pnpm typecheck
	pnpm openapi:check
