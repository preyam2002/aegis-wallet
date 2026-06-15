import { describe, expect, it } from "vitest";
import { listRecentActivityRows } from "./activity";

const wallet =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";

describe("listRecentActivityRows", () => {
	it("queries recent Sui transactions and normalizes wallet balance movement", async () => {
		const calls: unknown[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			const request = JSON.parse(String(init?.body)) as {
				params: [{ filter: { FromAddress?: string; ToAddress?: string } }];
			};
			calls.push(request);
			const isFromQuery = request.params[0].filter.FromAddress === wallet;
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: {
						data: isFromQuery ? outgoingTransactions : incomingTransactions,
					},
				}),
				{ status: 200 },
			);
		};

		const rows = await listRecentActivityRows(wallet, { fetcher, limit: 3 });

		expect(calls).toEqual([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_queryTransactionBlocks",
				params: [
					{
						filter: { FromAddress: wallet },
						options: {
							showBalanceChanges: true,
							showEffects: true,
							showInput: true,
						},
					},
					null,
					3,
					true,
				],
			},
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_queryTransactionBlocks",
				params: [
					{
						filter: { ToAddress: wallet },
						options: {
							showBalanceChanges: true,
							showEffects: true,
							showInput: true,
						},
					},
					null,
					3,
					true,
				],
			},
		]);
		expect(rows).toEqual([
			{
				id: "send-digest",
				digest: "send-digest",
				timestampMs: "1770000003000",
				direction: "outbound",
				amountMist: "1000000000",
				coinType: "0x2::sui::SUI",
				label: "Sent SUI",
				status: "success",
			},
			{
				id: "receive-digest",
				digest: "receive-digest",
				timestampMs: "1770000002000",
				direction: "inbound",
				amountMist: "250000000",
				coinType: "0x2::sui::SUI",
				label: "Received SUI",
				status: "failure",
			},
			{
				id: "object-only",
				digest: "object-only",
				timestampMs: "1770000001000",
				direction: "internal",
				amountMist: "0",
				label: "Wallet activity",
				status: "success",
			},
		]);
	});

	it("reports wallet movement for the primary coin without summing unrelated coin types", async () => {
		const rows = await listRecentActivityRows(wallet, {
			fetcher: fetcherFor({
				outgoing: [
					{
						digest: "swap-digest",
						timestampMs: "1770000004000",
						effects: { status: { status: "success" } },
						balanceChanges: [
							{
								owner: { AddressOwner: wallet },
								coinType: "0x2::sui::SUI",
								amount: "-1000",
							},
							{
								owner: { AddressOwner: wallet },
								coinType: "0xpackage::coin::TOKEN",
								amount: "5000",
							},
						],
					},
				],
				incoming: [],
			}),
			limit: 3,
		});

		expect(rows[0]).toMatchObject({
			digest: "swap-digest",
			direction: "outbound",
			amountMist: "1000",
			coinType: "0x2::sui::SUI",
			label: "Sent SUI",
		});
	});

	it("matches short and full Sui address forms when reading balance changes", async () => {
		const rows = await listRecentActivityRows("0xabc1", {
			fetcher: fetcherFor({
				outgoing: [],
				incoming: [
					{
						digest: "short-address-digest",
						timestampMs: "1770000005000",
						effects: { status: { status: "success" } },
						balanceChanges: [
							{
								owner: {
									AddressOwner:
										"0x000000000000000000000000000000000000000000000000000000000000abc1",
								},
								coinType: "0x2::sui::SUI",
								amount: "42",
							},
						],
					},
				],
			}),
			limit: 3,
		});

		expect(rows[0]).toMatchObject({
			digest: "short-address-digest",
			direction: "inbound",
			amountMist: "42",
			coinType: "0x2::sui::SUI",
			label: "Received SUI",
		});
	});
});

const fetcherFor =
	({
		outgoing,
		incoming,
	}: {
		outgoing: typeof outgoingTransactions;
		incoming: typeof incomingTransactions;
	}): typeof fetch =>
	async (_url, init) => {
		const request = JSON.parse(String(init?.body)) as {
			params: [{ filter: { FromAddress?: string; ToAddress?: string } }];
		};
		const isFromQuery = Boolean(request.params[0].filter.FromAddress);
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				result: { data: isFromQuery ? outgoing : incoming },
			}),
			{ status: 200 },
		);
	};

const outgoingTransactions = [
	{
		digest: "send-digest",
		timestampMs: "1770000003000",
		effects: { status: { status: "success" } },
		balanceChanges: [
			{
				owner: { AddressOwner: wallet },
				coinType: "0x2::sui::SUI",
				amount: "-1000000000",
			},
			{
				owner: { AddressOwner: `0x${"ef".repeat(32)}` },
				coinType: "0x2::sui::SUI",
				amount: "1000000000",
			},
		],
	},
	{
		digest: "object-only",
		timestampMs: "1770000001000",
		effects: { status: { status: "success" } },
		balanceChanges: [
			{
				owner: { ObjectOwner: "0xobject" },
				coinType: "0x2::sui::SUI",
				amount: "99",
			},
		],
	},
];

const incomingTransactions = [
	outgoingTransactions[0],
	{
		digest: "receive-digest",
		timestampMs: "1770000002000",
		effects: { status: { status: "failure" } },
		balanceChanges: [
			{
				owner: { AddressOwner: wallet },
				coinType: "0x2::sui::SUI",
				amount: "250000000",
			},
		],
	},
];
