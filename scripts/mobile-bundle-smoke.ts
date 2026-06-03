import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { writeMobileBundle } from "../mobile/src/bundle";

const outDir = new URL("../mobile/dist", import.meta.url).pathname;
await writeMobileBundle(outDir);

const readGenerated = (path: string) =>
	readFile(new URL(`../mobile/dist/${path}`, import.meta.url), "utf8");

const appJson = JSON.parse(await readGenerated("app.json"));
const packageJson = JSON.parse(await readGenerated("package.json"));
const appTsx = await readGenerated("App.tsx");
const walletShell = await readGenerated("src/walletShell.ts");

const extractConstJson = (name: string) => {
	const match = walletShell.match(
		new RegExp(`export const ${name} = ([\\s\\S]*?) as const;`),
	);
	if (!match) {
		throw new Error(`missing generated ${name}`);
	}
	return JSON.parse(match[1]);
};

const walletTabs = extractConstJson("walletTabs") as {
	id: string;
	capabilities: string[];
}[];
const walletCapabilities = extractConstJson("walletCapabilities") as string[];
const safeSigningPolicy = extractConstJson("safeSigningPolicy") as {
	safeSigningRequiresBiometric: boolean;
	riskLevels: string[];
	decisions: string[];
};

assert.equal(appJson.expo.name, "Aegis Wallet");
assert.equal(appJson.expo.ios.bundleIdentifier, "app.aegis.wallet");
assert.equal(appJson.expo.android.package, "app.aegis.wallet");
assert.equal(packageJson.dependencies.expo, "~53.0.0");
assert.equal(packageJson.dependencies.react, "19.0.0");
assert.equal(packageJson.dependencies["react-native"], "0.79.0");
assert.match(appTsx, /Aegis Wallet/);
assert.match(appTsx, /walletCapabilities\.length/);

assert.deepEqual(
	walletTabs.map((tab) => tab.id),
	["portfolio", "activity", "actions", "dapps", "settings"],
);
assert.deepEqual(walletCapabilities, [
	"portfolio",
	"activity",
	"send",
	"receive-qr",
	"qr-scan",
	"swap",
	"stake",
	"dapp-browser",
	"safe-signing",
	"vault-mode",
	"guardian-recovery",
	"notifications",
]);
assert.deepEqual(safeSigningPolicy, {
	safeSigningRequiresBiometric: true,
	riskLevels: ["low", "medium", "high", "critical"],
	decisions: ["approve", "reject"],
});

console.log(
	JSON.stringify(
		{
			surface: "mobile-bundle",
			status: "passed",
			checked: [
				"expo-identifiers",
				"native-dependencies",
				"wallet-tabs",
				"wallet-capabilities",
				"safe-signing-biometric-policy",
			],
		},
		null,
		2,
	),
);
