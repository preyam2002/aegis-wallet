import { describe, expect, it } from "vitest";
import { explainWalletError } from "./error-copy";

describe("wallet error copy", () => {
	it("turns Move coin aborts into actionable signing copy", () => {
		expect(explainWalletError("MoveAbort in 0x2::coin")).toEqual({
			title: "Coin operation failed",
			detail:
				"The transaction tried to use a coin object in a way Sui rejected. Pick a different coin or refresh your balance before signing.",
		});
	});

	it("explains the Sui staking minimum without leaking framework internals", () => {
		expect(
			explainWalletError(
				"MoveAbort in 0x3::validator_set: EInsufficientStakingAmount MIN_STAKING_THRESHOLD",
			),
		).toEqual({
			title: "Stake amount is too small",
			detail:
				"Sui requires at least 1 SUI for native staking. Increase the amount or keep the funds liquid.",
		});
	});

	it("maps swap slippage failures to the next user action", () => {
		expect(
			explainWalletError("route failed because slippage exceeded"),
		).toEqual({
			title: "Swap price moved",
			detail:
				"The route no longer fits your slippage limit. Refresh the quote or raise slippage before trying again.",
		});
	});
});
