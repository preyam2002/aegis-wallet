import type { PortfolioTokenBalance } from "./portfolio";
import { type RpcFetcher, TESTNET_RPC_URL } from "./testnet-rpc";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const SUI_USD_PRICE_URL =
	"https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd";

export type TokenPriceQuote = {
	coinType: string;
	decimals: number;
	usdPrice: number;
};

export type TokenMetadata = {
	coinType: string;
	decimals: number;
	name: string;
	symbol: string;
};

export type ValuedPortfolioToken = PortfolioTokenBalance & {
	amount: string;
	name?: string;
	decimals?: number;
	usdPrice?: number;
	usdValue?: string;
};

export const valuePortfolioTokens = (
	tokens: PortfolioTokenBalance[],
	prices: TokenPriceQuote[],
	metadata: TokenMetadata[] = [],
): ValuedPortfolioToken[] => {
	const pricesByCoinType = new Map(
		prices.map((price) => [price.coinType, price] as const),
	);
	const metadataByCoinType = new Map(
		metadata.map((entry) => [entry.coinType, entry] as const),
	);

	return tokens.map((token) => {
		const price = pricesByCoinType.get(token.coinType);
		const tokenMetadata = metadataByCoinType.get(token.coinType);
		const decimals = price?.decimals ?? tokenMetadata?.decimals;
		if (decimals === undefined) {
			return {
				...token,
				amount: token.totalBalance,
			};
		}

		const amount = formatBaseUnits(token.totalBalance, decimals);
		return {
			...token,
			symbol: tokenMetadata?.symbol ?? token.symbol,
			...(tokenMetadata?.name ? { name: tokenMetadata.name } : {}),
			decimals,
			amount,
			...(price
				? {
						usdPrice: price.usdPrice,
						usdValue: formatUsd(Number(amount) * price.usdPrice),
					}
				: {}),
		};
	});
};

export const loadTokenMetadata = async (
	tokens: { coinType: string }[],
	{
		fetcher = fetch,
	}: {
		fetcher?: RpcFetcher;
	} = {},
): Promise<TokenMetadata[]> => {
	const coinTypes = [...new Set(tokens.map((token) => token.coinType))];
	const metadata = await Promise.all(
		coinTypes.map((coinType) => fetchCoinMetadata(coinType, fetcher)),
	);

	return metadata.filter((entry): entry is TokenMetadata => entry !== null);
};

export const fetchSuiUsdPrice = async ({
	fetcher = fetch,
}: {
	fetcher?: typeof fetch;
} = {}): Promise<TokenPriceQuote> => {
	const response = await fetcher(SUI_USD_PRICE_URL);
	if (!response.ok) {
		throw new Error(`CoinGecko SUI price failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as {
		sui?: { usd?: number };
	};
	const usdPrice = body.sui?.usd;
	if (typeof usdPrice !== "number" || !Number.isFinite(usdPrice)) {
		throw new Error("CoinGecko SUI price response did not include sui.usd");
	}

	return {
		coinType: SUI_COIN_TYPE,
		decimals: 9,
		usdPrice,
	};
};

type CoinMetadataResponse = {
	decimals?: number;
	name?: string;
	symbol?: string;
} | null;

type JsonRpcResponse<T> = {
	jsonrpc: "2.0";
	id: number;
	result?: T;
	error?: { code: number; message: string };
};

const fetchCoinMetadata = async (
	coinType: string,
	fetcher: RpcFetcher,
): Promise<TokenMetadata | null> => {
	const response = await fetcher(TESTNET_RPC_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "suix_getCoinMetadata",
			params: [coinType],
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Sui RPC suix_getCoinMetadata failed with HTTP ${response.status}`,
		);
	}

	const body = (await response.json()) as JsonRpcResponse<CoinMetadataResponse>;
	if (body.error) {
		throw new Error(
			`Sui RPC suix_getCoinMetadata failed: ${body.error.message}`,
		);
	}
	if (!body.result) {
		return null;
	}

	return {
		coinType,
		decimals: body.result.decimals ?? 0,
		name: body.result.name ?? coinSymbol(coinType),
		symbol: body.result.symbol ?? coinSymbol(coinType),
	};
};

const formatBaseUnits = (rawAmount: string, decimals: number): string => {
	const value = BigInt(rawAmount);
	if (decimals === 0) {
		return value.toString();
	}

	const sign = value < 0n ? "-" : "";
	const absolute = value < 0n ? -value : value;
	const divisor = 10n ** BigInt(decimals);
	const whole = absolute / divisor;
	const fractional = (absolute % divisor).toString().padStart(decimals, "0");
	const trimmedFractional = fractional.replace(/0+$/, "");

	return trimmedFractional.length > 0
		? `${sign}${whole}.${trimmedFractional}`
		: `${sign}${whole}`;
};

const formatUsd = (value: number): string =>
	(Math.round(value * 100) / 100).toFixed(2);

const coinSymbol = (coinType: string): string => {
	if (coinType === SUI_COIN_TYPE) {
		return "SUI";
	}

	const baseType = coinType.split("<")[0] ?? coinType;
	return baseType.split("::").at(-1) ?? baseType;
};
