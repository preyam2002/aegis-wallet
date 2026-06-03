import { execFileSync } from "node:child_process";
import {
	fetchSuiUsdPrice,
	loadWalletPortfolio,
	valuePortfolioTokens,
} from "@aegis/shared";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const [portfolio, suiUsdPrice] = await Promise.all([
	loadWalletPortfolio(address, { objectLimit: 50 }),
	fetchSuiUsdPrice(),
]);
const valuedTokens = valuePortfolioTokens(portfolio.tokens, [suiUsdPrice]);
const pricedTokens = valuedTokens.filter((token) => token.usdValue);

if (pricedTokens.length === 0) {
	throw new Error(`no priced tokens found for ${address}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address,
			suiUsdPrice: suiUsdPrice.usdPrice,
			tokenCount: valuedTokens.length,
			pricedTokenCount: pricedTokens.length,
			samplePricedTokens: pricedTokens.slice(0, 5),
			sampleUnpricedTokens: valuedTokens
				.filter((token) => !token.usdValue)
				.slice(0, 5),
		},
		null,
		2,
	),
);
