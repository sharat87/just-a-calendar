serve:
	@if command -v mkcert &> /dev/null; then \
		echo Starting server with HTTPS.; \
		mkcert -install; \
		mkcert localhost; \
		npx parcel serve --port 3020 --cert localhost.pem --key localhost-key.pem; \
	else \
		echo Starting server with HTTP.; \
		npx parcel serve --port 3020; \
	fi

build:
	yarn install --frozen-lockfile
	npx parcel build --no-autoinstall --no-source-maps --no-cache --detailed-report 9
