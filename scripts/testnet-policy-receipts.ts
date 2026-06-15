import { TESTNET_RPC_URL } from "@aegis/shared";
import { extractJsonRpcPolicyReceipts } from "../app/src/lib/policy-receipts";

const DEFAULT_AEGIS_PACKAGE_ID =
	"0x25989dc31ce2eb030ced1c06f0b926acabb2f893f868b1357b7032664c605d03";

const packageId = process.env.AEGIS_PACKAGE_ID ?? DEFAULT_AEGIS_PACKAGE_ID;
const rpcUrl = process.env.AEGIS_JSON_RPC_URL ?? TESTNET_RPC_URL;
const events = (
	await Promise.all(
		["PolicyPassed", "PolicyRejected"].map((eventName) =>
			queryEvents(`${packageId}::policy::${eventName}`),
		),
	)
).flat();
const receipts = extractJsonRpcPolicyReceipts(events);

if (!receipts.some((receipt) => receipt.status === "passed")) {
	throw new Error("PolicyPassed receipt was not found in live testnet events");
}
if (!receipts.some((receipt) => receipt.status === "rejected")) {
	throw new Error(
		"PolicyRejected receipt was not found in live testnet events",
	);
}

console.log(
	JSON.stringify({ network: "testnet", packageId, receipts }, null, 2),
);

async function queryEvents(moveEventType: string) {
	const response = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "suix_queryEvents",
			params: [{ MoveEventType: moveEventType }, null, 5, true],
		}),
	});
	if (!response.ok) {
		throw new Error(`suix_queryEvents failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as {
		result?: { data?: unknown[] };
		error?: { message?: string };
	};
	if (body.error) {
		throw new Error(`suix_queryEvents failed: ${body.error.message}`);
	}

	return body.result?.data ?? [];
}
