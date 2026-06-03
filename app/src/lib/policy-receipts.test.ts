import { describe, expect, it } from "vitest";
import { extractPolicyReceipts } from "./policy-receipts";

describe("extractPolicyReceipts", () => {
	it("extracts PolicyPassed and PolicyRejected events from Sui transaction events", () => {
		const receipts = extractPolicyReceipts("txdigest", [
			{
				packageId: "0x2598",
				module: "policy",
				sender: "0xsender",
				eventType: "0x2598::policy::PolicyPassed",
				bcs: new Uint8Array(),
				json: {
					policy_id: "0xa471",
					tx_digest: [98, 101, 110, 105, 103, 110],
					reason: [
						112, 111, 108, 105, 99, 121, 32, 112, 97, 115, 115, 101, 100,
					],
				},
			},
			{
				packageId: "0x2598",
				module: "policy",
				sender: "0xsender",
				eventType: "0x2598::policy::PolicyRejected",
				bcs: new Uint8Array(),
				json: {
					policy_id: "0xa471",
					tx_digest: "drain",
					reason: "recipient is not allowlisted",
				},
			},
		]);

		expect(receipts).toEqual([
			{
				digest: "txdigest",
				status: "passed",
				policyId: "0xa471",
				txDigest: "benign",
				reason: "policy passed",
			},
			{
				digest: "txdigest",
				status: "rejected",
				policyId: "0xa471",
				txDigest: "drain",
				reason: "recipient is not allowlisted",
			},
		]);
	});

	it("ignores unrelated events and null json payloads", () => {
		const receipts = extractPolicyReceipts("txdigest", [
			{
				packageId: "0x2",
				module: "coin",
				sender: "0xsender",
				eventType: "0x2::coin::CoinCreated",
				bcs: new Uint8Array(),
				json: {},
			},
			{
				packageId: "0x2598",
				module: "policy",
				sender: "0xsender",
				eventType: "0x2598::policy::PolicyPassed",
				bcs: new Uint8Array(),
				json: null,
			},
		]);

		expect(receipts).toEqual([]);
	});

	it("decodes gRPC base64 vector<u8> event fields", () => {
		const receipts = extractPolicyReceipts("txdigest", [
			{
				packageId: "0x2598",
				module: "policy",
				sender: "0xsender",
				eventType: "0x2598::policy::PolicyPassed",
				bcs: new Uint8Array(),
				json: {
					policy_id: "0xa471",
					tx_digest: "AQID",
					reason: "cGFzcw==",
				},
			},
		]);

		expect(receipts[0]?.txDigest).toBe("0x010203");
		expect(receipts[0]?.reason).toBe("pass");
	});
});
