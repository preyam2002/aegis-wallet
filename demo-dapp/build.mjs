// Bundles app.ts -> app.js using the repo's exact @mysten versions.
// esbuild + the @mysten deps live in the extension workspace, so we resolve
// both from there (this dir is intentionally not a workspace package).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const extensionPkg = join(repo, "extension", "package.json");
const require = createRequire(extensionPkg);
const esbuild = require("esbuild");

await esbuild.build({
	entryPoints: [join(here, "app.ts")],
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "es2022",
	outfile: join(here, "app.js"),
	nodePaths: [join(repo, "extension", "node_modules"), join(repo, "node_modules")],
	define: { "process.env.NODE_ENV": '"production"' },
	logLevel: "info",
});

console.log("demo-dapp built -> demo-dapp/app.js");
