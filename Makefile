serve:
	@if [[ package.json -nt yarn.lock ]]; then yarn install; fi
	@if command -v mkcert &> /dev/null; then \
		mkcert -install; \
		mkcert localhost; \
	fi
	node build.mjs serve

build:
	yarn install --frozen-lockfile
	node build.mjs

chrome-with-tz:
	rm -rf tmp-chrome-profile
	TZ="$${TZ:-America/New_York}" open -na "Google Chrome" --args "--user-data-dir=$$PWD/tmp-chrome-profile"

outdated:
	yarn outdated


.PHONY: serve build chrome-with-tz outdated
