export type AftermathExactInRouteInput = {
	coinInType: string;
	coinOutType: string;
	coinInAmount: bigint;
	referrer?: string;
	protocolWhitelist?: string[];
	protocolBlacklist?: string[];
	poolWhitelist?: string[];
	poolBlacklist?: string[];
};

export type AftermathRoute = {
	routes: { paths?: { protocolName?: string }[] }[];
	netTradeFeePercentage: number;
	coinIn: { type: string; amount: bigint; tradeFee: bigint };
	coinOut: { type: string; amount: bigint; tradeFee: bigint };
	spotPrice: number;
};

export type AftermathRouterLike = {
	getCompleteTradeRouteGivenAmountIn(
		input: AftermathExactInRouteInput,
		abortSignal?: AbortSignal,
	): Promise<AftermathRoute>;
	getTransactionForCompleteTradeRoute(input: {
		walletAddress: string;
		completeRoute: AftermathRoute;
		slippage: number;
		isSponsoredTx?: boolean;
	}): Promise<unknown>;
};

export type AftermathSwapQuote = {
	provider: "aftermath";
	walletFeeBps: 0;
	coinInType: string;
	coinInAmount: string;
	coinOutType: string;
	coinOutAmount: string;
	netTradeFeePercentage: number;
	protocols: string[];
	route: AftermathRoute;
};

export const getAftermathSwapQuote = async (
	router: AftermathRouterLike,
	input: AftermathExactInRouteInput,
	abortSignal?: AbortSignal,
): Promise<AftermathSwapQuote> => {
	const route = await router.getCompleteTradeRouteGivenAmountIn(
		input,
		abortSignal,
	);

	return {
		provider: "aftermath",
		walletFeeBps: 0,
		coinInType: route.coinIn.type,
		coinInAmount: route.coinIn.amount.toString(),
		coinOutType: route.coinOut.type,
		coinOutAmount: route.coinOut.amount.toString(),
		netTradeFeePercentage: route.netTradeFeePercentage,
		protocols: collectProtocols(route),
		route,
	};
};

export const buildAftermathSwapTransaction = (
	{ getTransactionForCompleteTradeRoute }: AftermathRouterLike,
	{
		walletAddress,
		route,
		slippage,
		isSponsoredTx = false,
	}: {
		walletAddress: string;
		route: AftermathRoute;
		slippage: number;
		isSponsoredTx?: boolean;
	},
) => {
	assertSuiAddress(walletAddress);
	return getTransactionForCompleteTradeRoute({
		walletAddress,
		completeRoute: route,
		slippage,
		isSponsoredTx,
	});
};

const collectProtocols = (route: AftermathRoute): string[] => [
	...new Set(
		route.routes.flatMap((subRoute) =>
			(subRoute.paths ?? [])
				.map((path) => path.protocolName)
				.filter((protocol): protocol is string => Boolean(protocol)),
		),
	),
];

const assertSuiAddress = (address: string) => {
	if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
		throw new Error("expected canonical Sui address");
	}
};
