import { describe, expect, it } from "vitest";
import { buildAftermathSwapTransaction, getAftermathSwapQuote } from "./swaps";

const route = {
	routes: [
		{
			paths: [{ protocolName: "Cetus" }, { protocolName: "DeepBookV3" }],
		},
	],
	netTradeFeePercentage: 0.002,
	coinIn: {
		type: "0x2::sui::SUI",
		amount: 10_000_000n,
		tradeFee: 0n,
	},
	coinOut: {
		type: "0x5d4b::coin::COIN",
		amount: 31_000n,
		tradeFee: 0n,
	},
	spotPrice: 0.0031,
};

describe("Aftermath swap integration", () => {
	it("requests an exact-in route without adding a wallet fee", async () => {
		const calls: unknown[] = [];
		const router = {
			async getCompleteTradeRouteGivenAmountIn(input: unknown) {
				calls.push(input);
				return route;
			},
			async getTransactionForCompleteTradeRoute() {
				throw new Error("not used");
			},
		};

		const quote = await getAftermathSwapQuote(router, {
			coinInType: "0x2::sui::SUI",
			coinOutType: "0x5d4b::coin::COIN",
			coinInAmount: 10_000_000n,
		});

		expect(calls).toEqual([
			{
				coinInType: "0x2::sui::SUI",
				coinOutType: "0x5d4b::coin::COIN",
				coinInAmount: 10_000_000n,
			},
		]);
		expect(quote).toEqual({
			provider: "aftermath",
			walletFeeBps: 0,
			coinInType: "0x2::sui::SUI",
			coinInAmount: "10000000",
			coinOutType: "0x5d4b::coin::COIN",
			coinOutAmount: "31000",
			netTradeFeePercentage: 0.002,
			protocols: ["Cetus", "DeepBookV3"],
			route,
		});
	});

	it("builds the Aftermath route transaction with wallet address and slippage", async () => {
		const calls: unknown[] = [];
		const tx = { kind: "transaction" };
		const router = {
			async getCompleteTradeRouteGivenAmountIn() {
				throw new Error("not used");
			},
			async getTransactionForCompleteTradeRoute(input: unknown) {
				calls.push(input);
				return tx;
			},
		};

		await expect(
			buildAftermathSwapTransaction(router, {
				walletAddress:
					"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a",
				route,
				slippage: 0.01,
			}),
		).resolves.toBe(tx);

		expect(calls).toEqual([
			{
				walletAddress:
					"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a",
				completeRoute: route,
				slippage: 0.01,
				isSponsoredTx: false,
			},
		]);
	});
});
