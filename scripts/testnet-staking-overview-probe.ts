import { execFileSync } from "node:child_process";
import { loadStakingOverview } from "@aegis/shared";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const overview = await loadStakingOverview(address);

if (overview.activeValidatorCount === 0) {
	throw new Error("testnet returned no active validators");
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address,
			epoch: overview.epoch,
			positionCount: overview.positions.length,
			activeValidatorCount: overview.activeValidatorCount,
			samplePositions: overview.positions.slice(0, 5),
			topValidators: overview.topValidators.slice(0, 5),
		},
		null,
		2,
	),
);
