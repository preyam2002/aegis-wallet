export type WalletErrorCopy = {
	title: string;
	detail: string;
};

export const explainWalletError = (rawError: string): WalletErrorCopy => {
	const normalized = rawError.toLowerCase();

	if (
		normalized.includes("slippage") ||
		normalized.includes("price moved") ||
		normalized.includes("quote")
	) {
		return {
			title: "Swap price moved",
			detail:
				"The route no longer fits your slippage limit. Refresh the quote or raise slippage before trying again.",
		};
	}

	if (
		normalized.includes("min_staking_threshold") ||
		normalized.includes("einsufficientstakingamount")
	) {
		return {
			title: "Stake amount is too small",
			detail:
				"Sui requires at least 1 SUI for native staking. Increase the amount or keep the funds liquid.",
		};
	}

	if (normalized.includes("0x2::coin") || normalized.includes("coin")) {
		return {
			title: "Coin operation failed",
			detail:
				"The transaction tried to use a coin object in a way Sui rejected. Pick a different coin or refresh your balance before signing.",
		};
	}

	return {
		title: "Transaction failed",
		detail: rawError,
	};
};
