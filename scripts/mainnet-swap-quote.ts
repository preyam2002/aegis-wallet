import {
	type AftermathExactInRouteInput,
	type AftermathRoute,
	getAftermathSwapQuote,
} from "../app/src/lib/swaps";

const coinInType = process.env.AEGIS_SWAP_COIN_IN ?? "0x2::sui::SUI";
const coinOutType =
	process.env.AEGIS_SWAP_COIN_OUT ??
	"0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
const coinInAmount = BigInt(process.env.AEGIS_SWAP_AMOUNT_MIST ?? "10000000");

const router = {
	async getCompleteTradeRouteGivenAmountIn(input: AftermathExactInRouteInput) {
		const route = await callAftermathApi<AftermathRoute>("trade-route", input);
		return route;
	},
	async getTransactionForCompleteTradeRoute() {
		throw new Error("transaction build is not used by the read-only quote smoke");
	},
};

const quote = await getAftermathSwapQuote(router, {
	coinInType,
	coinOutType,
	coinInAmount,
});

console.log(
	JSON.stringify(
		{
			network: "mainnet",
			provider: quote.provider,
			walletFeeBps: quote.walletFeeBps,
			coinInType: quote.coinInType,
			coinInAmount: quote.coinInAmount,
			coinOutType: quote.coinOutType,
			coinOutAmount: quote.coinOutAmount,
			netTradeFeePercentage: quote.netTradeFeePercentage,
			protocols: quote.protocols,
			routeCount: quote.route.routes.length,
		},
		null,
		2,
	),
);

async function callAftermathApi<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`https://aftermath.finance/api/router/${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: stringifyWithAftermathBigInts(body),
	});

	if (!response.ok) {
		throw new Error(await response.text());
	}

	return parseAftermathJson<T>(await response.text());
}

function stringifyWithAftermathBigInts(value: unknown): string {
	return JSON.stringify(value, (_, item) =>
		typeof item === "bigint" ? `${item.toString()}n` : item,
	);
}

function parseAftermathJson<T>(value: string): T {
	return JSON.parse(value, (_, item) => {
		if (typeof item === "string" && /^\d+n$/.test(item)) {
			return BigInt(item.slice(0, -1));
		}

		return item;
	}) as T;
}
