.PHONY: help install dev stop check test e2e audit

# Same default as lib/port.mjs. Override with `make dev PORT=4342`.
PORT ?= 4341
export PORT

## help: list the commands
help:
	@grep -E '^## [a-z0-9-]+:' Makefile | sed 's/^## /  make /'

## install: install dependencies from the lockfile, without install scripts
install:
	npm ci --ignore-scripts

## dev: start the game (and Ollama if needed) and open the browser
dev: node_modules
	node scripts/start.mjs

## stop: stop the game server on PORT, only if it is this app
#
# Another app may hold the port, so check /api/status first. SIGTERM lets the
# launcher also stop the Ollama it started.
stop:
	@pids=$$(lsof -t -iTCP@127.0.0.1:$(PORT) -sTCP:LISTEN 2>/dev/null || true); \
	if [ -z "$$pids" ]; then echo "port $(PORT): not running"; exit 0; fi; \
	if ! curl -s -m 2 http://127.0.0.1:$(PORT)/api/status | grep -q '"engineRevision"'; then \
		echo "port $(PORT) is used by another app (pid $$pids); not stopping it"; exit 1; \
	fi; \
	echo "stopping Unwritten Life on port $(PORT) (pid $$pids)"; \
	kill $$pids

## check: syntax check, unit tests and the dependency audit
check: node_modules
	npm run check
	npm run audit

## test: unit tests only
test: node_modules
	npm test

## e2e: browser tests (Playwright)
e2e: node_modules
	npm run test:e2e

## audit: production dependency vulnerabilities (high and above)
audit: node_modules
	npm run audit

node_modules: package-lock.json
	npm ci --ignore-scripts
	@touch node_modules
