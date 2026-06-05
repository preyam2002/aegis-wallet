import { describe, expect, it } from "vitest";
import {
	analyzeTransaction,
	detectAddressPoisoning,
	type TransactionPreviewInput,
} from "./transaction-analysis";

/**
 * Reproducible "Aegis blocks a drainer" demo scenario.
 *
 * Each case feeds a hostile transaction through the SAME safety modules the
 * signing screen uses (`analyzeTransaction` / `detectAddressPoisoning`) and
 * asserts the exact user-facing copy a judge will see. No new heuristics — this
 * is the deterministic backbone of the live demo (see docs/overflow-demo-script.md).
 *
 * Risk levels: low | medium | high | critical. `high` and `critical` are the
 * blocking levels the signing screen renders in red and gates signing on.
 */

const WALLET =
	"0xa1a1000000000000000000000000000000000000000000000000000000000001";
const DRAINER =
	"0xdead000000000000000000000000000000000000000000000000000000000bad";
const UNVERIFIED_PACKAGE =
	"0xbad9000000000000000000000000000000000000000000000000000000000bad";

const TREASURY =
	"0x9999aaaa000000000000000000000000000000000000000000000000aaaa0001";
const POISONED_LOOKALIKE =
	"0x9999aaaa111111111111111111111111111111111111111111111111aaaa0001";

const basePolicy: TransactionPreviewInput["policy"] = {
	knownRecipients: [
		"0xf00d000000000000000000000000000000000000000000000000000000000f00",
	],
	trustedPackages: ["0x2"],
	knownDrainers: [DRAINER],
	previouslyInteractedPackages: ["0x2"],
	brandNewPackages: [],
	maxOutflowBps: 5_000,
};

describe("Safe Wallet demo — Aegis blocks a drainer", () => {
	it("blocks a transfer to a curated-denylist drainer", () => {
		const result = analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{ owner: WALLET, coinType: "0x2::sui::SUI", amount: "-1000000000" },
					{ owner: DRAINER, coinType: "0x2::sui::SUI", amount: "1000000000" },
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: basePolicy,
			addressBook: [],
		});

		const drainer = result.findings.find(
			(finding) => finding.kind === "known-drainer",
		);
		expect(drainer).toEqual({
			kind: "known-drainer",
			level: "critical",
			title: "Known drainer recipient",
			detail: "The recipient is on the configured blocklist.",
		});
		expect(result.riskLevel).toBe("critical");
	});

	it("blocks a full wallet coin sweep", () => {
		const result = analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{ owner: WALLET, coinType: "0x2::sui::SUI", amount: "-10000000000" },
					{
						owner:
							"0xf00d000000000000000000000000000000000000000000000000000000000f00",
						coinType: "0x2::sui::SUI",
						amount: "10000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: { ...basePolicy, maxOutflowBps: 10_000 },
			addressBook: [],
		});

		const sweep = result.findings.find(
			(finding) => finding.kind === "coin-sweep",
		);
		expect(sweep).toEqual({
			kind: "coin-sweep",
			level: "high",
			title: "Wallet sweep",
			detail: "This transaction empties the wallet's SUI balance.",
		});
		expect(result.riskLevel).toBe("high");
	});

	it("blocks a moveCall into an unverified package", () => {
		const result = analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [],
				objectChanges: [],
				packagesTouched: [UNVERIFIED_PACKAGE],
			},
			policy: basePolicy,
			addressBook: [],
		});

		const untrusted = result.findings.find(
			(finding) => finding.kind === "untrusted-package",
		);
		expect(untrusted).toEqual({
			kind: "untrusted-package",
			level: "high",
			title: "Untrusted package",
			detail: "0xbad9...0bad has not been marked trusted.",
		});
		expect(result.riskLevel).toBe("high");
	});

	it("blocks a send to a poisoned look-alike of a saved contact", () => {
		const addressBook = [{ label: "Treasury", address: TREASURY }];

		const sideBySide = detectAddressPoisoning(POISONED_LOOKALIKE, addressBook);
		expect(sideBySide).toEqual({
			label: "Treasury",
			address: TREASURY,
			reason: "same prefix and same suffix",
		});

		const result = analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{ owner: WALLET, coinType: "0x2::sui::SUI", amount: "-1000000000" },
					{
						owner: POISONED_LOOKALIKE,
						coinType: "0x2::sui::SUI",
						amount: "1000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: basePolicy,
			addressBook,
		});

		const poisoning = result.findings.find(
			(finding) => finding.kind === "address-poisoning",
		);
		expect(poisoning).toEqual({
			kind: "address-poisoning",
			level: "high",
			title: "Address looks like a saved contact",
			detail: "0x9999...0001 has the same prefix and same suffix as Treasury.",
		});
		expect(["high", "critical"]).toContain(result.riskLevel);
	});
});
