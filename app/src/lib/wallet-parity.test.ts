import { describe, expect, it } from "vitest";
import {
	getWalletParityGaps,
	summarizeWalletParity,
	walletParityMatrix,
} from "./wallet-parity";

describe("wallet feature parity contract", () => {
	it("tracks required Slush, MetaMask, and Phantom capability families", () => {
		const ids = new Set(walletParityMatrix.map((row) => row.id));

		expect(ids).toEqual(
			new Set([
				"portfolio-activity",
				"send-receive-qr",
				"swap-stake-defi",
				"fiat-onramp",
				"nft-collectibles",
				"dapp-extension-mobile",
				"safe-signing",
				"permissions-accounts",
				"network-settings",
				"security-settings",
				"passkey-zklogin-sponsored",
				"vault-recovery",
				"bridge-multichain",
				"advanced-consumer-trading",
			]),
		);
	});

	it("does not claim externally gated or planned parity as complete", () => {
		const summary = summarizeWalletParity();
		const gaps = getWalletParityGaps();

		expect(summary.total).toBe(14);
		expect(summary.implemented).toBe(7);
		expect(summary.gated).toBe(7);
		expect(summary.planned).toBe(0);
		expect(gaps).toHaveLength(7);
		expect(
			walletParityMatrix.find((row) => row.id === "network-settings")
				?.aegisStatus,
		).toBe("implemented");
		expect(
			walletParityMatrix.find((row) => row.id === "security-settings")
				?.aegisStatus,
		).toBe("implemented");
		expect(
			walletParityMatrix.find((row) => row.id === "fiat-onramp")?.aegisStatus,
		).toBe("gated");
		expect(
			walletParityMatrix.find((row) => row.id === "bridge-multichain")
				?.aegisStatus,
		).toBe("gated");
		expect(
			walletParityMatrix.find((row) => row.id === "advanced-consumer-trading")
				?.aegisStatus,
		).toBe("gated");
		expect(
			walletParityMatrix.find((row) => row.id === "vault-recovery")
				?.aegisStatus,
		).toBe("gated");
	});

	it("keeps competitor evidence attached to every parity row", () => {
		for (const row of walletParityMatrix) {
			expect(row.category).toBeTruthy();
			expect(row.capability).toBeTruthy();
			expect(row.aegisEvidence).toBeTruthy();
			expect(Object.keys(row.peers).length).toBeGreaterThan(0);
		}
	});
});
