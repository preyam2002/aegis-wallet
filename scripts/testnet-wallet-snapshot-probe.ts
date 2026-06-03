import { execFileSync } from "node:child_process";
import { loadLiveWalletSnapshot } from "../app/src/lib/wallet-snapshot";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const snapshot = await loadLiveWalletSnapshot(address);

if (snapshot.portfolioRows.length === 0) {
	throw new Error(`wallet snapshot returned no portfolio rows for ${address}`);
}

if (snapshot.activityRows.length === 0) {
	throw new Error(`wallet snapshot returned no activity rows for ${address}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address: snapshot.address,
			totalUsdValue: snapshot.totalUsdValue,
			portfolioRowCount: snapshot.portfolioRows.length,
			activityRowCount: snapshot.activityRows.length,
			nftRowCount: snapshot.nftRows.length,
			defiRowCount: snapshot.defiRows.length,
			stakingRowCount: snapshot.stakingRows.length,
			activeValidatorCount: snapshot.activeValidatorCount,
			capabilityCount: snapshot.capabilityCount,
			otherObjectCount: snapshot.otherObjectCount,
			samplePortfolioRows: snapshot.portfolioRows.slice(0, 5),
			sampleActivityRows: snapshot.activityRows.slice(0, 5),
			sampleDefiRows: snapshot.defiRows.slice(0, 5),
			sampleStakingRows: snapshot.stakingRows.slice(0, 5),
		},
		null,
		2,
	),
);
