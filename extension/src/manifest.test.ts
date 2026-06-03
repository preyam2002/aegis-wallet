import { describe, expect, it } from "vitest";
import { createExtensionManifest } from "./manifest";

describe("Aegis extension manifest", () => {
	it("declares a minimal MV3 wallet extension surface", () => {
		expect(createExtensionManifest()).toEqual({
			manifest_version: 3,
			name: "Aegis Wallet",
			version: "0.1.0",
			description:
				"Safe Sui wallet with pre-sign simulation and optional Vault Mode.",
			action: {
				default_popup: "popup.html",
				default_title: "Aegis Wallet",
			},
			background: {
				service_worker: "background.js",
				type: "module",
			},
			content_scripts: [
				{
					matches: ["http://*/*", "https://*/*"],
					js: ["content.js"],
					run_at: "document_start",
				},
			],
			permissions: ["storage"],
			host_permissions: ["http://*/*", "https://*/*"],
		});
	});
});
