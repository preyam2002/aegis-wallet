import { describe, expect, it } from "vitest";
import {
	simulateTransactionToSummary,
	TESTNET_GRPC_URL,
} from "./sui-core-client";

const user =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";
const recipient =
	"0xdef0000000000000000000000000000000000000000000000000000000000002";

describe("sui core client adapter", () => {
	it("uses the v2 core simulateTransaction include shape and maps the transaction result", async () => {
		const calls: unknown[] = [];
		const client = {
			core: {
				simulateTransaction: async (input: unknown) => {
					calls.push(input);
					return {
						$kind: "Transaction" as const,
						Transaction: {
							status: { success: true as const, error: null },
							balanceChanges: [
								{ coinType: "0x2::sui::SUI", address: user, amount: "-5" },
								{ coinType: "0x2::sui::SUI", address: recipient, amount: "5" },
							],
							effects: {
								gasUsed: {
									computationCost: "1",
									storageCost: "2",
									storageRebate: "0",
									nonRefundableStorageFee: "0",
								},
								changedObjects: [],
							},
							objectTypes: {},
						},
					};
				},
			},
		};

		const summary = await simulateTransactionToSummary({
			client,
			transaction: new Uint8Array([1, 2, 3]),
			userAddress: user,
		});

		expect(calls).toEqual([
			{
				transaction: new Uint8Array([1, 2, 3]),
				include: { balanceChanges: true, effects: true, objectTypes: true },
			},
		]);
		expect(summary.sends).toEqual([
			{ coinType: "0x2::sui::SUI", amount: "-5", to: recipient },
		]);
		expect(summary.gas).toBe("3");
	});

	it("maps FailedTransaction responses without assuming a top-level objectChanges field", async () => {
		const client = {
			core: {
				simulateTransaction: async () => ({
					$kind: "FailedTransaction" as const,
					FailedTransaction: {
						status: {
							success: false as const,
							error: "No valid gas coins found",
						},
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
						objectTypes: {},
					},
				}),
			},
		};

		await expect(
			simulateTransactionToSummary({
				client,
				transaction: new Uint8Array([9]),
				userAddress: user,
			}),
		).resolves.toMatchObject({
			failed: { error: "No valid gas coins found" },
			objectsLeaving: [],
		});
	});

	it("pins the testnet gRPC endpoint used by the web wallet", () => {
		expect(TESTNET_GRPC_URL).toBe("https://fullnode.testnet.sui.io:443");
	});
});
