import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMobileBundle, writeMobileBundle } from "./bundle";

describe("Aegis mobile bundle", () => {
	it("generates the Expo files needed for the native mobile shell", () => {
		const bundle = createMobileBundle();

		expect(bundle.map((file) => file.path).sort()).toEqual([
			"App.tsx",
			"app.json",
			"package.json",
			"src/walletShell.ts",
			"tsconfig.json",
			"types/react-native.d.ts",
		]);
		expect(bundle.find((file) => file.path === "app.json")?.content).toContain(
			'"slug": "aegis-wallet"',
		);
		expect(bundle.find((file) => file.path === "App.tsx")?.content).toContain(
			"Aegis Wallet",
		);
		expect(
			bundle.find((file) => file.path === "src/walletShell.ts")?.content,
		).toContain("guardian-recovery");
		expect(
			bundle.find((file) => file.path === "src/walletShell.ts")?.content,
		).toContain("safeSigningRequiresBiometric");
		expect(
			bundle.find((file) => file.path === "src/walletShell.ts")?.content,
		).toContain("critical");
		const packageJson = JSON.parse(
			bundle.find((file) => file.path === "package.json")?.content ?? "{}",
		);
		expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
		expect(
			bundle.find((file) => file.path === "tsconfig.json")?.content,
		).toContain('"jsx": "react-native"');
		expect(
			bundle.find((file) => file.path === "types/react-native.d.ts")?.content,
		).toContain('declare module "react-native"');
	});

	it("writes the native mobile shell files to disk", async () => {
		const outDir = await mkdtemp(join(tmpdir(), "aegis-mobile-"));

		try {
			await writeMobileBundle(outDir);

			expect((await readdir(outDir)).sort()).toEqual([
				"App.tsx",
				"app.json",
				"package.json",
				"src",
				"tsconfig.json",
				"types",
			]);
			expect(await readFile(join(outDir, "App.tsx"), "utf8")).toContain(
				"Safe signing",
			);
			expect(
				await readFile(join(outDir, "src/walletShell.ts"), "utf8"),
			).toContain("vault-mode");
			expect(
				await readFile(join(outDir, "src/walletShell.ts"), "utf8"),
			).toContain("safeSigningRequiresBiometric");
		} finally {
			await rm(outDir, { force: true, recursive: true });
		}
	});
});
