import { execFileSync } from "node:child_process";
import { createTestnetGrpcClient, simulateTransactionToSummary } from "@aegis/shared";
import { Transaction } from "@mysten/sui/transactions";

const address =
  process.env.AEGIS_TESTNET_ADDRESS ??
  execFileSync("sui", ["client", "active-address"], { encoding: "utf8" }).trim();

const client = createTestnetGrpcClient();
const tx = new Transaction();
tx.setSender(address);

const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
tx.transferObjects([coin], tx.pure.address(address));

const bytes = await tx.build({ client });
const summary = await simulateTransactionToSummary({
  client,
  transaction: bytes,
  userAddress: address,
});

console.log(
  JSON.stringify(
    {
      network: "testnet",
      address,
      txBytesLength: bytes.length,
      summary,
    },
    null,
    2,
  ),
);
