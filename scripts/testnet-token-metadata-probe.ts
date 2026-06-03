import { execFileSync } from "node:child_process";
import {
	fetchSuiUsdPrice,
	loadTokenMetadata,
	loadWalletPortfolio,
	valuePortfolioTokens,
} from "@aegis/shared";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const portfolio = await loadWalletPortfolio(address, { objectLimit: 50 });
const [metadata, suiUsdPrice] = await Promise.all([
	loadTokenMetadata(portfolio.tokens),
	fetchSuiUsdPrice(),
]);
const valuedTokens = valuePortfolioTokens(portfolio.tokens, [suiUsdPrice], metadata);

if (metadata.length === 0) {
	throw new Error(`no coin metadata found for ${address}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address,
			tokenCount: portfolio.tokens.length,
			metadataCount: metadata.length,
			sampleMetadata: metadata.slice(0, 5),
			sampleValuedTokens: valuedTokens.slice(0, 5),
		},
		null,
		2,
	),
);
