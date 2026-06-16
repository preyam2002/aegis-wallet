import type { DryRunResponseLike } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { analyzeSend } from "./send-flow";
import { buildDefaultWalletPolicy } from "./wallet-policy";

const SENDER =
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const KNOWN =
	"0x38e8000000000000000000000000000000000000000000000000000000009212";
const DRAINER = `0xdead${"0".repeat(58)}01`;
const CONTACT = `0x7afe00${"0".repeat(50)}beadbeef`;
const POISONED = `0x7afe00${"1".repeat(50)}beadbeef`;
const TOTAL = 50_000_000_000n;

const gasUsed = {
	computationCost: "1000000",
	storageCost: "2000000",
	storageRebate: "980000",
	nonRefundableStorageFee: "9900",
};

const sendDryRun = (recipient: string): DryRunResponseLike => ({
	effects: { status: { status: "success" }, gasUsed },
	balanceChanges: [
		{ owner: { AddressOwner: SENDER }, coinType: "0x2::sui::SUI", amount: "-1001000" },
		{ owner: { AddressOwner: recipient }, coinType: "0x2::sui::SUI", amount: "1000" },
	],
	objectChanges: [],
});

describe("analyzeSend", () => {
	it("rates a small send to a known recipient as low risk", () => {
		const analysis = analyzeSend({
			dryRun: sendDryRun(KNOWN),
			sender: SENDER,
			totalMist: TOTAL,
			policy: buildDefaultWalletPolicy({ knownRecipients: [KNOWN] }),
			addressBook: [],
		});

		expect(analysis.riskLevel).toBe("low");
		expect(analysis.findings).toHaveLength(0);
	});

	it("blocks a send to a denylisted drainer as critical", () => {
		const analysis = analyzeSend({
			dryRun: sendDryRun(DRAINER),
			sender: SENDER,
			totalMist: TOTAL,
			policy: buildDefaultWalletPolicy({ knownDrainers: [DRAINER] }),
			addressBook: [],
		});

		expect(analysis.riskLevel).toBe("critical");
		expect(analysis.findings.map((f) => f.kind)).toContain("known-drainer");
	});

	it("flags a look-alike of a saved contact as address poisoning", () => {
		const analysis = analyzeSend({
			dryRun: sendDryRun(POISONED),
			sender: SENDER,
			totalMist: TOTAL,
			policy: buildDefaultWalletPolicy(),
			addressBook: [{ label: "Treasury", address: CONTACT }],
		});

		expect(analysis.findings.map((f) => f.kind)).toContain("address-poisoning");
		expect(analysis.riskLevel).toBe("high");
	});

	it("surfaces a failed dry-run as a blocking simulation finding", () => {
		const analysis = analyzeSend({
			dryRun: {
				effects: {
					status: { status: "failure", error: "InsufficientGas" },
					gasUsed,
				},
				balanceChanges: [],
			},
			sender: SENDER,
			totalMist: TOTAL,
			policy: buildDefaultWalletPolicy(),
			addressBook: [],
		});

		expect(analysis.riskLevel).toBe("critical");
		expect(analysis.findings.map((f) => f.kind)).toContain("simulation-risk");
	});
});
