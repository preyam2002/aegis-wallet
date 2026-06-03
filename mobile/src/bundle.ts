import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createMobileWalletShell } from "./shell";

export type MobileBundleFile = {
	path: string;
	content: string;
};

export const createMobileBundle = (): MobileBundleFile[] => {
	const shell = createMobileWalletShell({ biometricUnlocked: false });

	return [
		{
			path: "app.json",
			content: `${JSON.stringify(appJson, null, 2)}\n`,
		},
		{
			path: "package.json",
			content: `${JSON.stringify(packageJson, null, 2)}\n`,
		},
		{
			path: "App.tsx",
			content: appTsx,
		},
		{
			path: "tsconfig.json",
			content: `${JSON.stringify(tsconfigJson, null, 2)}\n`,
		},
		{
			path: "src/walletShell.ts",
			content: `export const walletTabs = ${JSON.stringify(shell.tabs, null, 2)} as const;\nexport const walletCapabilities = ${JSON.stringify(shell.capabilities, null, 2)} as const;\nexport const safeSigningPolicy = ${JSON.stringify(safeSigningPolicy, null, 2)} as const;\n`,
		},
		{
			path: "types/react-native.d.ts",
			content: reactNativeTypes,
		},
	];
};

export const writeMobileBundle = async (outDir: string) => {
	for (const file of createMobileBundle()) {
		const target = join(outDir, file.path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, file.content, "utf8");
	}
};

const appJson = {
	expo: {
		name: "Aegis Wallet",
		slug: "aegis-wallet",
		version: "0.1.0",
		orientation: "portrait",
		userInterfaceStyle: "automatic",
		assetBundlePatterns: ["**/*"],
		ios: {
			supportsTablet: false,
			bundleIdentifier: "app.aegis.wallet",
		},
		android: {
			package: "app.aegis.wallet",
		},
	},
};

const packageJson = {
	name: "aegis-wallet-mobile-app",
	version: "0.1.0",
	private: true,
	main: "node_modules/expo/AppEntry.js",
	scripts: {
		start: "expo start",
		ios: "expo run:ios",
		android: "expo run:android",
		typecheck: "tsc --noEmit",
	},
	dependencies: {
		expo: "~53.0.0",
		react: "19.0.0",
		"react-native": "0.79.0",
	},
	devDependencies: {
		typescript: "5.9.3",
	},
};

const safeSigningPolicy = {
	safeSigningRequiresBiometric: true,
	riskLevels: ["low", "medium", "high", "critical"],
	decisions: ["approve", "reject"],
};

const tsconfigJson = {
	compilerOptions: {
		target: "ES2022",
		module: "ESNext",
		moduleResolution: "Bundler",
		jsx: "react-native",
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
	},
	include: ["App.tsx", "src/**/*.ts", "types/**/*.d.ts"],
};

const reactNativeTypes = `declare const React: {
	createElement: (...args: unknown[]) => unknown;
};

declare namespace JSX {
	interface IntrinsicElements {
		[key: string]: unknown;
	}
}

declare module "react-native" {
	type Component = (props: {
		children?: unknown;
		[key: string]: unknown;
	}) => unknown;
	export const SafeAreaView: Component;
	export const ScrollView: Component;
	export const StyleSheet: {
		create<T extends Record<string, unknown>>(styles: T): T;
	};
	export const Text: Component;
	export const View: Component;
}
`;

const appTsx = `import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { walletCapabilities, walletTabs } from "./src/walletShell";

export default function App() {
	return (
		<SafeAreaView style={styles.root}>
			<ScrollView contentContainerStyle={styles.content}>
				<Text style={styles.eyebrow}>Safe signing</Text>
				<Text style={styles.title}>Aegis Wallet</Text>
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Mobile shell</Text>
					<Text style={styles.muted}>{walletCapabilities.length} wallet capabilities ready</Text>
				</View>
				{walletTabs.map((tab) => (
					<View style={styles.row} key={tab.id}>
						<Text style={styles.rowTitle}>{tab.id}</Text>
						<Text style={styles.muted}>{tab.capabilities.join(" / ")}</Text>
					</View>
				))}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: "#11120f" },
	content: { gap: 12, padding: 20 },
	eyebrow: { color: "#9ee8bd", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
	title: { color: "#f4f0df", fontSize: 34, fontWeight: "800" },
	card: { backgroundColor: "#1b1d17", borderRadius: 8, padding: 16 },
	cardTitle: { color: "#f4f0df", fontSize: 18, fontWeight: "700" },
	row: { backgroundColor: "#151711", borderRadius: 8, padding: 14 },
	rowTitle: { color: "#f4f0df", fontSize: 16, fontWeight: "700" },
	muted: { color: "#a9ad9b", marginTop: 4 },
});
`;
