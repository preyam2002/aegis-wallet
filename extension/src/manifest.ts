export type ExtensionManifest = {
	manifest_version: 3;
	name: string;
	version: string;
	description: string;
	action: {
		default_popup: string;
		default_title: string;
	};
	background: {
		service_worker: string;
		type: "module";
	};
	content_scripts: {
		matches: string[];
		js: string[];
		run_at: "document_start";
	}[];
	permissions: string[];
	host_permissions: string[];
};

export const createExtensionManifest = (): ExtensionManifest => ({
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
