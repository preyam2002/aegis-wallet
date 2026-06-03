import { describe, expect, it } from "vitest";
import {
	fetchSuiUsdPrice,
	loadTokenMetadata,
	type TokenPriceQuote,
	valuePortfolioTokens,
} from "./portfolio-values";

describe("portfolio USD valuation", () => {
	it("applies decimal-aware USD prices to portfolio tokens", () => {
		const prices: TokenPriceQuote[] = [
			{
				coinType: "0x2::sui::SUI",
				decimals: 9,
				usdPrice: 1.25,
			},
			{
				coinType: "0xpackage::usdc::USDC",
				decimals: 6,
				usdPrice: 1,
			},
		];

		const valued = valuePortfolioTokens(
			[
				{
					coinType: "0x2::sui::SUI",
					symbol: "SUI",
					coinObjectCount: 2,
					totalBalance: "2500000000",
				},
				{
					coinType: "0xpackage::usdc::USDC",
					symbol: "USDC",
					coinObjectCount: 1,
					totalBalance: "1234567",
				},
			],
			prices,
		);

		expect(valued).toEqual([
			{
				coinType: "0x2::sui::SUI",
				symbol: "SUI",
				coinObjectCount: 2,
				totalBalance: "2500000000",
				decimals: 9,
				amount: "2.5",
				usdPrice: 1.25,
				usdValue: "3.13",
			},
			{
				coinType: "0xpackage::usdc::USDC",
				symbol: "USDC",
				coinObjectCount: 1,
				totalBalance: "1234567",
				decimals: 6,
				amount: "1.234567",
				usdPrice: 1,
				usdValue: "1.23",
			},
		]);
	});

	it("keeps unpriced tokens visible without fabricating a USD value", () => {
		const [valued] = valuePortfolioTokens(
			[
				{
					coinType: "0xpackage::bbeth::BBETH",
					symbol: "BBETH",
					coinObjectCount: 4,
					totalBalance: "123",
				},
			],
			[],
		);

		expect(valued).toEqual({
			coinType: "0xpackage::bbeth::BBETH",
			symbol: "BBETH",
			coinObjectCount: 4,
			totalBalance: "123",
			amount: "123",
		});
	});

	it("uses coin metadata to format unpriced token balances and names", () => {
		const [valued] = valuePortfolioTokens(
			[
				{
					coinType: "0xpackage::bbeth::BBETH",
					symbol: "BBETH",
					coinObjectCount: 449,
					totalBalance: "10425387288615",
				},
			],
			[],
			[
				{
					coinType: "0xpackage::bbeth::BBETH",
					decimals: 9,
					name: "AlphaTest ETH",
					symbol: "bbETH",
				},
			],
		);

		expect(valued).toEqual({
			coinType: "0xpackage::bbeth::BBETH",
			symbol: "bbETH",
			name: "AlphaTest ETH",
			coinObjectCount: 449,
			totalBalance: "10425387288615",
			decimals: 9,
			amount: "10425.387288615",
		});
	});

	it("loads coin metadata for portfolio token types", async () => {
		const calls: unknown[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			const request = JSON.parse(String(init?.body));
			calls.push(request);
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: {
						decimals: 9,
						name: "AlphaTest ETH",
						symbol: "bbETH",
					},
				}),
				{ status: 200 },
			);
		};

		const metadata = await loadTokenMetadata(
			[{ coinType: "0xpackage::bbeth::BBETH" }],
			{ fetcher },
		);

		expect(calls).toEqual([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_getCoinMetadata",
				params: ["0xpackage::bbeth::BBETH"],
			},
		]);
		expect(metadata).toEqual([
			{
				coinType: "0xpackage::bbeth::BBETH",
				decimals: 9,
				name: "AlphaTest ETH",
				symbol: "bbETH",
			},
		]);
	});

	it("fetches the live SUI/USD price from CoinGecko", async () => {
		const calls: string[] = [];
		const fetcher: typeof fetch = async (url) => {
			calls.push(String(url));
			return new Response(JSON.stringify({ sui: { usd: 0.8318 } }), {
				status: 200,
			});
		};

		const quote = await fetchSuiUsdPrice({ fetcher });

		expect(calls).toEqual([
			"https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
		]);
		expect(quote).toEqual({
			coinType: "0x2::sui::SUI",
			decimals: 9,
			usdPrice: 0.8318,
		});
	});
});
