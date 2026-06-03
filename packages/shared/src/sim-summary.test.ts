import { describe, expect, it } from "vitest";
import {
	type CoreTransactionForSummary,
	summarizeSimulation,
} from "./sim-summary";

const user =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";
const recipient =
	"0xdef0000000000000000000000000000000000000000000000000000000000002";

describe("summarizeSimulation", () => {
	it("maps successful core simulation effects to the shared SimSummary contract", () => {
		const transaction: CoreTransactionForSummary = {
			status: { success: true, error: null },
			balanceChanges: [
				{ coinType: "0x2::sui::SUI", address: user, amount: "-1250000000" },
				{ coinType: "0x2::sui::SUI", address: recipient, amount: "1250000000" },
				{ coinType: "0x2::sui::SUI", address: user, amount: "250000000" },
			],
			objectTypes: {
				"0xnft": "0xcollection::nft::DemoNft",
			},
			effects: {
				gasUsed: {
					computationCost: "1000",
					storageCost: "2000",
					storageRebate: "500",
					nonRefundableStorageFee: "0",
				},
				changedObjects: [
					{
						objectId: "0xnft",
						inputOwner: { $kind: "Address", Address: { address: user } },
						outputOwner: { $kind: "Address", Address: { address: recipient } },
						outputState: "ObjectWrite",
						idOperation: "None",
					},
				],
			},
		};

		const summary = summarizeSimulation(transaction, user);

		expect(summary).toEqual({
			sends: [
				{ coinType: "0x2::sui::SUI", amount: "-1250000000", to: recipient },
			],
			receives: [{ coinType: "0x2::sui::SUI", amount: "250000000" }],
			objectsLeaving: [
				{
					objectId: "0xnft",
					type: "0xcollection::nft::DemoNft",
					to: recipient,
				},
			],
			gas: "2500",
			risk: [],
		});
	});

	it("preserves failed simulation errors without fabricating effects", () => {
		const transaction: CoreTransactionForSummary = {
			status: { success: false, error: "MoveAbort in 0x2::coin" },
			balanceChanges: [],
			effects: {
				gasUsed: {
					computationCost: "0",
					storageCost: "0",
					storageRebate: "0",
					nonRefundableStorageFee: "0",
				},
				changedObjects: [],
			},
		};

		const summary = summarizeSimulation(transaction, user);

		expect(summary).toEqual({
			sends: [],
			receives: [],
			objectsLeaving: [],
			gas: "0",
			risk: [
				{ level: "block", reason: "Simulation failed: MoveAbort in 0x2::coin" },
			],
			failed: { error: "MoveAbort in 0x2::coin" },
		});
	});
});
