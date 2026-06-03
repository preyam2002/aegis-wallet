import { createTestnetGrpcClient } from "@aegis/shared";
import { fetchPolicyReceipts } from "../app/src/lib/policy-receipts";

const receiptDigests = [
  "CYAb3vHi9W6EB2wQucSRKgqr1Vt65Rkt6vFSAQMRjThU",
  "G2pDdgmuJfUNGTk27CtgETgrFWnuwviR3pZkPHhJFjcE",
];

const client = createTestnetGrpcClient();
const receipts = await fetchPolicyReceipts(client, receiptDigests);

if (!receipts.some((receipt) => receipt.status === "passed")) {
  throw new Error("PolicyPassed receipt was not found in live testnet digests");
}
if (!receipts.some((receipt) => receipt.status === "rejected")) {
  throw new Error("PolicyRejected receipt was not found in live testnet digests");
}

console.log(JSON.stringify({ network: "testnet", receipts }, null, 2));
