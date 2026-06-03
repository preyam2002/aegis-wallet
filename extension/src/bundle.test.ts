import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createExtensionBundle, writeExtensionBundle } from "./bundle";

describe("Aegis extension bundle", () => {
	it("generates the MV3 files needed to load the wallet extension", () => {
		const bundle = createExtensionBundle();

		expect(bundle.map((file) => file.path).sort()).toEqual([
			"background.js",
			"content.js",
			"manifest.json",
			"popup.html",
			"popup.js",
		]);

		const manifest = JSON.parse(
			bundle.find((file) => file.path === "manifest.json")?.content ?? "{}",
		);
		expect(manifest).toMatchObject({
			manifest_version: 3,
			action: { default_popup: "popup.html" },
			background: { service_worker: "background.js", type: "module" },
			content_scripts: [{ js: ["content.js"] }],
		});

		expect(
			bundle.find((file) => file.path === "popup.html")?.content,
		).toContain("aegis-extension-popup");
		expect(
			bundle.find((file) => file.path === "popup.html")?.content,
		).toContain('script src="popup.js"');
		expect(bundle.find((file) => file.path === "popup.js")?.content).toContain(
			"aegis:list-reviews",
		);
		expect(bundle.find((file) => file.path === "popup.js")?.content).toContain(
			"aegis:resolve-review",
		);
		expect(bundle.find((file) => file.path === "popup.js")?.content).toContain(
			"aegis-review-list",
		);
		expect(
			bundle.find((file) => file.path === "popup.js")?.content,
		).not.toContain("card.innerHTML");
		expect(
			bundle.find((file) => file.path === "background.js")?.content,
		).toContain("aegis:simulate-and-sign");
		expect(
			bundle.find((file) => file.path === "background.js")?.content,
		).toContain("aegis:resolve-review");
		expect(
			bundle.find((file) => file.path === "background.js")?.content,
		).toContain("pendingReviews");
		expect(
			bundle.find((file) => file.path === "content.js")?.content,
		).toContain("aegis:connect");
	});

	it("writes the loadable extension files to disk", async () => {
		const outDir = await mkdtemp(join(tmpdir(), "aegis-extension-"));

		try {
			await writeExtensionBundle(outDir);

			expect((await readdir(outDir)).sort()).toEqual([
				"background.js",
				"content.js",
				"manifest.json",
				"popup.html",
				"popup.js",
			]);
			expect(await readFile(join(outDir, "manifest.json"), "utf8")).toContain(
				'"manifest_version": 3',
			);
		} finally {
			await rm(outDir, { force: true, recursive: true });
		}
	});
});
