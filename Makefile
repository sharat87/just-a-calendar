serve:
	@if [[ package.json -nt pnpm-lock.yaml ]]; then pnpm install; fi
	@if command -v mkcert &> /dev/null; then \
		mkcert -install; \
		mkcert localhost; \
	fi
	node build.mjs serve

build:
	pnpm install --frozen-lockfile
	node build.mjs

typecheck:
	pnpm install --frozen-lockfile
	pnpm exec tsc --noEmit

chrome-with-tz:
	rm -rf tmp-chrome-profile
	TZ="$${TZ:-America/New_York}" open -na "Google Chrome" --args "--user-data-dir=$$PWD/tmp-chrome-profile"

outdated:
	pnpm outdated


.PHONY: serve build typecheck chrome-with-tz outdated
