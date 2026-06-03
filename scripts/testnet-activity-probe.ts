import { execFileSync } from "node:child_process";
import { listRecentActivityRows } from "@aegis/shared";

const address =
	process.env.AEGIS_TESTNET_ADDRESS ??
	execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const rows = await listRecentActivityRows(address, { limit: 10 });

if (rows.length === 0) {
	throw new Error(`no recent testnet activity found for ${address}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			address,
			activityCount: rows.length,
			sampleRows: rows.slice(0, 5),
		},
		null,
		2,
	),
);
