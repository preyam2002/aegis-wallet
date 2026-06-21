import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WalletDashboard } from "./WalletDashboard";

vi.mock("@aegis/shared", () => ({
	getSuiBalance: async () => ({ totalBalance: "0" }),
}));

vi.mock("../lib/wallet-account", () => ({
	useWalletAccount: () => ({
		status: "unlocked",
		activeAddress:
			"0xa1a1000000000000000000000000000000000000000000000000000000000001",
		accounts: [
			{
				address:
					"0xa1a1000000000000000000000000000000000000000000000000000000000001",
				label: "Main account",
				backupConfirmed: true,
			},
		],
		network: "testnet",
		lock: vi.fn(),
		signer: null,
		exportActiveSecret: vi.fn(),
		confirmBackup: vi.fn(),
	}),
}));

vi.mock("../lib/wallet-snapshot", () => ({
	loadLiveWalletSnapshot: async () => ({
		totalUsdValue: "$0.00",
		portfolioRows: [],
		activityRows: [],
	}),
}));

describe("WalletDashboard", () => {
	it("wallet view leads with the safety differentiator and testnet scope", () => {
		const html = renderToStaticMarkup(<WalletDashboard />);

		expect(html).toContain("See it block a drain");
		expect(html).toContain("Wallet sweep");
		expect(html).toContain("Testnet — no real funds");
	});

	it("security view surfaces the Vault Mode proof and the export path", () => {
		const html = renderToStaticMarkup(
			<WalletDashboard initialView="security" />,
		);

		expect(html).toContain("Vault Mode");
		expect(html).toContain("nitro-attested");
		expect(html).toContain("8P6f...HDQX");
		expect(html).toContain("Export secret key");
	});
});
