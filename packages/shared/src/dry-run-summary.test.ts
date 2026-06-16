import { describe, expect, it } from "vitest";
import { type DryRunResponseLike, summarizeDryRun } from "./dry-run-summary";

const USER =
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const RECIPIENT =
	"0x38e8000000000000000000000000000000000000000000000000000000009212";

const gasUsed = {
	computationCost: "1000000",
	storageCost: "2000000",
	storageRebate: "980000",
	nonRefundableStorageFee: "9900",
};

describe("summarizeDryRun", () => {
	it("maps a native SUI send into sends with inferred recipient and gas", () => {
		const response: DryRunResponseLike = {
			effects: { status: { status: "success" }, gasUsed },
			balanceChanges: [
				{
					owner: { AddressOwner: USER },
					coinType: "0x2::sui::SUI",
					amount: "-1001000",
				},
				{
					owner: { AddressOwner: RECIPIENT },
					coinType: "0x2::sui::SUI",
					amount: "1000",
				},
			],
			objectChanges: [],
		};

		const summary = summarizeDryRun(response, USER);

		expect(summary.sends).toEqual([
			{ coinType: "0x2::sui::SUI", amount: "-1001000", to: RECIPIENT },
		]);
		expect(summary.receives).toEqual([]);
		expect(summary.objectsLeaving).toEqual([]);
		// 1_000_000 + 2_000_000 - 980_000
		expect(summary.gas).toBe("2020000");
		expect(summary.risk).toEqual([]);
		expect(summary.failed).toBeUndefined();
	});

	it("records incoming balance changes as receives", () => {
		const response: DryRunResponseLike = {
			effects: { status: { status: "success" }, gasUsed },
			balanceChanges: [
				{
					owner: { AddressOwner: USER },
					coinType: "0x2::sui::SUI",
					amount: "5000",
				},
			],
		};

		const summary = summarizeDryRun(response, USER);
		expect(summary.receives).toEqual([
			{ coinType: "0x2::sui::SUI", amount: "5000" },
		]);
		expect(summary.sends).toEqual([]);
	});

	it("flags objects transferred away from the user as objectsLeaving", () => {
		const response: DryRunResponseLike = {
			effects: { status: { status: "success" }, gasUsed },
			objectChanges: [
				{
					type: "transferred",
					sender: USER,
					recipient: { AddressOwner: RECIPIENT },
					objectType: "0xpkg::nft::Item",
					objectId: "0xobj1",
				},
				{
					type: "mutated",
					sender: USER,
					objectType: "0x2::coin::Coin",
					objectId: "0xgas",
				},
			],
		};

		const summary = summarizeDryRun(response, USER);
		expect(summary.objectsLeaving).toEqual([
			{ objectId: "0xobj1", type: "0xpkg::nft::Item", to: RECIPIENT },
		]);
	});

	it("surfaces a failed simulation as failed + a block-level risk", () => {
		const response: DryRunResponseLike = {
			effects: {
				status: { status: "failure", error: "InsufficientGas" },
				gasUsed,
			},
			balanceChanges: [],
		};

		const summary = summarizeDryRun(response, USER);
		expect(summary.failed).toEqual({ error: "InsufficientGas" });
		expect(summary.risk).toEqual([
			{ level: "block", reason: "Simulation failed: InsufficientGas" },
		]);
	});

	it("is case-insensitive on the owner address and ignores non-address owners", () => {
		const response: DryRunResponseLike = {
			effects: { status: { status: "success" }, gasUsed },
			balanceChanges: [
				{
					owner: { AddressOwner: USER.toUpperCase() },
					coinType: "0x2::sui::SUI",
					amount: "-9000",
				},
				{ owner: "Immutable", coinType: "0x2::sui::SUI", amount: "-1" },
			],
		};

		const summary = summarizeDryRun(response, USER);
		expect(summary.sends).toHaveLength(1);
		expect(summary.sends[0]?.amount).toBe("-9000");
	});
});
