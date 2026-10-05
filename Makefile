.PHONY: install build test typecheck docker-build up down logs clean

install: ## npm install all workspaces
	npm install

build: ## build all workspaces that have a build script
	npm run build --workspaces --if-present

test: ## run all workspace tests
	npm run test --workspaces --if-present

typecheck: ## tsc --noEmit in every workspace
	npm run typecheck --workspaces --if-present

docker-build: ## build signal + web images
	docker compose build

up: ## start signal + web (web on $$WEB_PORT, default 8080)
	docker compose up -d --build

down: ## stop everything
	docker compose down

logs: ## tail all service logs
	docker compose logs -f

clean: ## remove containers, images, dist dirs
	docker compose down --rmi local -v --remove-orphans
	rm -rf apps/web/dist services/signal-node/dist
