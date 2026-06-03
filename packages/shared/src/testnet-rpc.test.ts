import { describe, expect, it } from "vitest";
import { getSuiBalance, listOwnedObjectTypes } from "./testnet-rpc";

describe("testnet rpc helpers", () => {
	it("requests the SUI balance for an address", async () => {
		const calls: unknown[] = [];
		const fetcher = async (
			_url: string | URL | Request,
			init?: RequestInit,
		) => {
			calls.push(JSON.parse(String(init?.body)));
			return jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: { coinType: "0x2::sui::SUI", totalBalance: "42" },
			});
		};

		const balance = await getSuiBalance("0xabc", fetcher);

		expect(balance).toEqual({ coinType: "0x2::sui::SUI", totalBalance: "42" });
		expect(calls).toEqual([
			{ jsonrpc: "2.0", id: 1, method: "suix_getBalance", params: ["0xabc"] },
		]);
	});

	it("extracts owned object types from testnet RPC results", async () => {
		const fetcher = async () =>
			jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: {
					data: [
						{ data: { type: "0x2::coin::Coin<0x2::sui::SUI>" } },
						{ data: { type: "0xpackage::cap::SessionCap" } },
					],
				},
			});

		await expect(listOwnedObjectTypes("0xabc", fetcher)).resolves.toEqual([
			"0x2::coin::Coin<0x2::sui::SUI>",
			"0xpackage::cap::SessionCap",
		]);
	});
});

const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
