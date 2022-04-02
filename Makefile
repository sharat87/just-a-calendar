serve:
	yarn install
	npx parcel serve --no-autoinstall --port 3020

build:
	yarn install --frozen-lockfile
	npx parcel build --no-autoinstall --no-source-maps --no-cache
