dev:
	@if [[ package.json -nt pnpm-lock.yaml ]]; then pnpm install; fi
	node build.mjs serve

build: lint
	node build.mjs

lint:
	pnpm install --frozen-lockfile
	pnpm exec tsc --noEmit


.PHONY: dev build lint
