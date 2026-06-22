import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "extension", "src");
const publicDir = join(root, "extension", "public");
const outDir = join(root, "extension", "dist");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
	entryPoints: {
		background: join(srcDir, "background.ts"),
		content: join(srcDir, "content.ts"),
		inpage: join(srcDir, "inpage.ts"),
		popup: join(srcDir, "popup.tsx"),
	},
	outdir: outDir,
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "chrome111",
	jsx: "automatic",
	define: { "process.env.NODE_ENV": '"production"' },
	logLevel: "info",
});

for (const file of ["manifest.json", "popup.html", "popup.css"]) {
	cpSync(join(publicDir, file), join(outDir, file));
}
cpSync(join(publicDir, "icons"), join(outDir, "icons"), { recursive: true });

console.log(`Aegis extension built → ${outDir}`);
