import { execFileSync } from "node:child_process";
import { getSuiBalance, listOwnedObjectTypes } from "@aegis/shared";

const address =
  process.env.AEGIS_TESTNET_ADDRESS ??
  execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const balance = await getSuiBalance(address);
const objectTypes = await listOwnedObjectTypes(address);

console.log(
  JSON.stringify(
    {
      network: "testnet",
      address,
      balance,
      objectTypeCount: objectTypes.length,
      sampleObjectTypes: objectTypes.slice(0, 5),
    },
    null,
    2,
  ),
);
