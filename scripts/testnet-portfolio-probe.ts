import { execFileSync } from "node:child_process";
import { loadWalletPortfolio } from "@aegis/shared";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const portfolio = await loadWalletPortfolio(address, { objectLimit: 50 });

if (portfolio.tokens.length === 0) {
	throw new Error(`no token balances found for ${address}`);
}

const objectCount =
	portfolio.collectibles.length +
	portfolio.capabilities.length +
	portfolio.defiPositions.length +
	portfolio.otherObjects.length;

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address,
			tokenCount: portfolio.tokens.length,
			objectCount,
			collectibleCount: portfolio.collectibles.length,
			capabilityCount: portfolio.capabilities.length,
			defiPositionCount: portfolio.defiPositions.length,
			sampleTokens: portfolio.tokens.slice(0, 5),
			sampleCollectibles: portfolio.collectibles.slice(0, 5),
			sampleCapabilities: portfolio.capabilities.slice(0, 5),
			sampleDefiPositions: portfolio.defiPositions.slice(0, 5),
			sampleOtherObjects: portfolio.otherObjects.slice(0, 5),
		},
		null,
		2,
	),
);
