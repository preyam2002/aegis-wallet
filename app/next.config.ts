import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(appRoot, "..");

const nextConfig: NextConfig = {
	// Fully client-side wallet — export a static site (deployable as plain files,
	// e.g. Vercel/any static host) without a Next.js server runtime.
	output: "export",
	turbopack: {
		root: workspaceRoot,
	},
};

export default nextConfig;
