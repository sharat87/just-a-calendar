// Minimal esbuild-based build/dev-server for this app. Usage:
//   node build.mjs         -- production build into dist/
//   node build.mjs serve   -- dev server with rebuild-on-request, on $PORT (default 3020)

import esbuild from "esbuild"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as http from "node:http"
import * as https from "node:https"
import * as path from "node:path"

const isServe = process.argv[2] === "serve"
const outdir = "dist"

async function copyStatic() {
	await fsp.cp("src/icons", path.join(outdir, "icons"), { recursive: true })
	await fsp.copyFile("src/styles.css", path.join(outdir, "styles.css"))
	await fsp.copyFile("src/manifest.json", path.join(outdir, "manifest.json"))
	await fsp.copyFile("src/index.html", path.join(outdir, "index.html"))
}

const buildOptions = {
	entryPoints: ["src/app.ts", "src/sw.js"],
	bundle: true,
	format: "esm",
	target: "es2020",
	outdir,
	minify: !isServe,
	sourcemap: isServe,
	logLevel: "info",
}

await fsp.rm(outdir, { recursive: true, force: true })
await fsp.mkdir(outdir, { recursive: true })

if (isServe) {
	const ctx = await esbuild.context(buildOptions)
	await copyStatic()

	// Re-copy static files (HTML/CSS/manifest/icons) whenever anything in src/ changes. JS/TS
	// output is handled by esbuild's own rebuild-on-request below, so this is a cheap no-op for
	// those files.
	fs.watch("src", { recursive: true }, () => {
		copyStatic().catch((err) => console.error("Error copying static files", err))
	})

	const { host, port } = await ctx.serve({ servedir: outdir })

	const listenPort = Number(process.env.PORT) || 3020
	const hasCert = fs.existsSync("localhost.pem") && fs.existsSync("localhost-key.pem")

	const onRequest = (req, res) => {
		const proxyReq = http.request(
			{ host, port, path: req.url, method: req.method, headers: req.headers },
			(proxyRes) => {
				res.writeHead(proxyRes.statusCode, proxyRes.headers)
				proxyRes.pipe(res, { end: true })
			},
		)
		req.pipe(proxyReq, { end: true })
	}

	const server = hasCert
		? https.createServer(
			{ cert: fs.readFileSync("localhost.pem"), key: fs.readFileSync("localhost-key.pem") },
			onRequest,
		)
		: http.createServer(onRequest)

	server.listen(listenPort, () => {
		console.log(`Serving on ${hasCert ? "https" : "http"}://localhost:${listenPort}`)
	})
} else {
	await copyStatic()
	await esbuild.build(buildOptions)
}
