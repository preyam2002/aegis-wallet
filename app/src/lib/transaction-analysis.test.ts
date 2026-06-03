import { describe, expect, it } from "vitest";
import {
	analyzeSimSummary,
	analyzeTransaction,
	detectAddressPoisoning,
	filterVisibleActivity,
	formatMist,
	type TransactionPreviewInput,
} from "./transaction-analysis";

const baseInput: TransactionPreviewInput = {
	walletAddress:
		"0xabc0000000000000000000000000000000000000000000000000000000000001",
	totalMist: 10_000_000_000n,
	effects: {
		balanceChanges: [
			{
				owner:
					"0xabc0000000000000000000000000000000000000000000000000000000000001",
				coinType: "0x2::sui::SUI",
				amount: "-9500000000",
			},
			{
				owner:
					"0x9999000000000000000000000000000000000000000000000000000000000009",
				coinType: "0x2::sui::SUI",
				amount: "9500000000",
			},
		],
		objectChanges: [
			{
				type: "transferred",
				objectId: "0xnft",
				objectType: "0xtrusted::collectible::AegisPass",
				recipient:
					"0x9999000000000000000000000000000000000000000000000000000000000009",
			},
		],
		packagesTouched: ["0xunknown"],
	},
	policy: {
		knownRecipients: ["0xfriend"],
		trustedPackages: ["0xtrusted"],
		knownDrainers: ["0xdrainer"],
		previouslyInteractedPackages: ["0xtrusted"],
		brandNewPackages: [],
		maxOutflowBps: 5_000,
	},
	addressBook: [
		{
			label: "Navi vault",
			address:
				"0x9999000000000000000000000000000000000000000000000000000000000008",
		},
	],
};

describe("formatMist", () => {
	it("formats mist as compact SUI", () => {
		expect(formatMist(1_250_000_000n)).toBe("1.25 SUI");
		expect(formatMist(42_000_000n)).toBe("0.042 SUI");
	});
});

describe("detectAddressPoisoning", () => {
	it("flags same-prefix and same-suffix look-alikes", () => {
		const result = detectAddressPoisoning(
			"0x9999000000000000000000000000000000000000000000000000000000000009",
			baseInput.addressBook,
		);

		expect(result?.label).toBe("Navi vault");
		expect(result?.reason).toContain("same prefix");
	});

	it("does not flag exact known addresses", () => {
		expect(
			detectAddressPoisoning(
				"0x9999000000000000000000000000000000000000000000000000000000000008",
				baseInput.addressBook,
			),
		).toBeNull();
	});
});

describe("analyzeTransaction", () => {
	it("classifies a large unknown-recipient outflow as critical", () => {
		const result = analyzeTransaction(baseInput);

		expect(result.netMist).toBe(-9_500_000_000n);
		expect(result.netObjects).toHaveLength(1);
		expect(result.riskLevel).toBe("critical");
		expect(result.summary).toBe("Sends 9.5 SUI and 1 object");
		expect(result.findings.map((finding) => finding.kind)).toEqual([
			"large-outflow",
			"unknown-recipient",
			"untrusted-package",
			"never-interacted-package",
			"address-poisoning",
		]);
	});

	it("flags known drainers before unknown-recipient warnings", () => {
		const input: TransactionPreviewInput = {
			...baseInput,
			effects: {
				...baseInput.effects,
				balanceChanges: [
					{
						owner: baseInput.walletAddress,
						coinType: "0x2::sui::SUI",
						amount: "-1000000000",
					},
					{
						owner: "0xdrainer",
						coinType: "0x2::sui::SUI",
						amount: "1000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0xtrusted"],
			},
		};

		const result = analyzeTransaction(input);

		expect(result.findings.map((finding) => finding.kind)).toContain(
			"known-drainer",
		);
		expect(result.riskLevel).toBe("critical");
	});

	it("flags coin sweeps even when the outflow limit is lenient", () => {
		const input: TransactionPreviewInput = {
			...baseInput,
			policy: {
				...baseInput.policy,
				maxOutflowBps: 10_000,
			},
			effects: {
				balanceChanges: [
					{
						owner: baseInput.walletAddress,
						coinType: "0x2::sui::SUI",
						amount: "-10000000000",
					},
					{
						owner: "0xfriend",
						coinType: "0x2::sui::SUI",
						amount: "10000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0xtrusted"],
			},
		};

		const result = analyzeTransaction(input);

		expect(result.findings.map((finding) => finding.kind)).toContain(
			"coin-sweep",
		);
		expect(result.riskLevel).toBe("high");
	});

	it("flags brand-new and never-interacted packages separately", () => {
		const input: TransactionPreviewInput = {
			...baseInput,
			effects: {
				...baseInput.effects,
				balanceChanges: [],
				objectChanges: [],
				packagesTouched: ["0xnewpackage", "0xordinary"],
			},
			policy: {
				...baseInput.policy,
				brandNewPackages: ["0xnewpackage"],
				trustedPackages: ["0xtrusted"],
				previouslyInteractedPackages: ["0xtrusted"],
			},
		};

		const result = analyzeTransaction(input);

		expect(result.findings.map((finding) => finding.kind)).toEqual([
			"untrusted-package",
			"brand-new-package",
			"never-interacted-package",
		]);
	});

	it("allows trusted low-value transfers", () => {
		const input: TransactionPreviewInput = {
			...baseInput,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{
						owner: baseInput.walletAddress,
						coinType: "0x2::sui::SUI",
						amount: "-100000000",
					},
					{
						owner: "0xfriend",
						coinType: "0x2::sui::SUI",
						amount: "100000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0xtrusted"],
			},
		};

		const result = analyzeTransaction(input);

		expect(result.riskLevel).toBe("low");
		expect(result.findings).toEqual([]);
		expect(result.summary).toBe("Sends 0.1 SUI");
	});
});

describe("analyzeSimSummary", () => {
	it("uses shared simulation sends, receives, object exits, gas, and risk for the signing model", () => {
		const result = analyzeSimSummary({
			walletAddress: baseInput.walletAddress,
			totalMist: 10_000_000_000n,
			summary: {
				sends: [
					{
						coinType: "0x2::sui::SUI",
						amount: "-2000000000",
						to: "0x9999000000000000000000000000000000000000000000000000000000000009",
					},
				],
				receives: [{ coinType: "0x2::sui::SUI", amount: "100000000" }],
				objectsLeaving: [
					{
						objectId: "0xnft",
						type: "0xtrusted::collectible::AegisPass",
						to: "0x9999000000000000000000000000000000000000000000000000000000000009",
					},
				],
				gas: "5000000",
				risk: [{ level: "warn", reason: "Package is newly published" }],
			},
			packagesTouched: ["0xtrusted"],
			policy: baseInput.policy,
			addressBook: baseInput.addressBook,
		});

		expect(result.netMist).toBe(-1_900_000_000n);
		expect(result.netObjects).toEqual([
			{
				type: "transferred",
				objectId: "0xnft",
				objectType: "0xtrusted::collectible::AegisPass",
				recipient:
					"0x9999000000000000000000000000000000000000000000000000000000000009",
			},
		]);
		expect(result.gasMist).toBe(5_000_000n);
		expect(result.findings.map((finding) => finding.kind)).toContain(
			"simulation-risk",
		);
		expect(result.riskLevel).toBe("high");
		expect(result.summary).toBe("Sends 1.9 SUI and 1 object");
	});

	it("turns failed shared simulations into blocking signing analysis", () => {
		const result = analyzeSimSummary({
			walletAddress: baseInput.walletAddress,
			totalMist: 10_000_000_000n,
			summary: {
				sends: [],
				receives: [],
				objectsLeaving: [],
				gas: "0",
				risk: [
					{
						level: "block",
						reason: "Simulation failed: MoveAbort in 0x2::coin",
					},
				],
				failed: { error: "MoveAbort in 0x2::coin" },
			},
			packagesTouched: [],
			policy: baseInput.policy,
			addressBook: baseInput.addressBook,
		});

		expect(result.failed).toEqual({
			title: "Coin operation failed",
			detail:
				"The transaction tried to use a coin object in a way Sui rejected. Pick a different coin or refresh your balance before signing.",
		});
		expect(result.riskLevel).toBe("critical");
		expect(result.findings).toEqual([
			{
				kind: "simulation-risk",
				level: "critical",
				title: "Simulation blocked",
				detail:
					"The transaction tried to use a coin object in a way Sui rejected. Pick a different coin or refresh your balance before signing.",
			},
		]);
	});
});

describe("filterVisibleActivity", () => {
	it("hides zero-value and dust inbound rows by default", () => {
		const rows = filterVisibleActivity([
			{
				id: "zero",
				direction: "inbound",
				amountMist: "0",
				label: "zero poison",
			},
			{
				id: "dust",
				direction: "inbound",
				amountMist: "1000",
				label: "dust poison",
			},
			{
				id: "real",
				direction: "inbound",
				amountMist: "50000000",
				label: "real payment",
			},
			{
				id: "send",
				direction: "outbound",
				amountMist: "1000",
				label: "small send",
			},
		]);

		expect(rows.map((row) => row.id)).toEqual(["real", "send"]);
	});
});
