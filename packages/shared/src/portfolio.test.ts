import { describe, expect, it } from "vitest";
import {
	listOwnedInventory,
	listTokenBalances,
	loadWalletPortfolio,
} from "./portfolio";

const wallet =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";

describe("portfolio inventory", () => {
	it("requests all token balances and normalizes symbols", async () => {
		const calls: unknown[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			calls.push(JSON.parse(String(init?.body)));
			return jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: [
					{
						coinType: "0x2::sui::SUI",
						coinObjectCount: 2,
						totalBalance: "2500000000",
					},
					{
						coinType: "0xpackage::usdc::USDC",
						coinObjectCount: 1,
						totalBalance: "1234",
					},
					{
						coinType:
							"0xpackage::vault::VaultShareToken<0xpackage::aausdc::AAUSDC, 0xpackage::bbeth::BBETH>",
						coinObjectCount: 1,
						totalBalance: "99",
					},
				],
			});
		};

		const balances = await listTokenBalances(wallet, { fetcher });

		expect(calls).toEqual([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_getAllBalances",
				params: [wallet],
			},
		]);
		expect(balances).toEqual([
			{
				coinType: "0x2::sui::SUI",
				symbol: "SUI",
				coinObjectCount: 2,
				totalBalance: "2500000000",
			},
			{
				coinType: "0xpackage::usdc::USDC",
				symbol: "USDC",
				coinObjectCount: 1,
				totalBalance: "1234",
			},
			{
				coinType:
					"0xpackage::vault::VaultShareToken<0xpackage::aausdc::AAUSDC, 0xpackage::bbeth::BBETH>",
				symbol: "VaultShareToken",
				coinObjectCount: 1,
				totalBalance: "99",
			},
		]);
	});

	it("lists owned objects with display names and NFT/capability classification", async () => {
		const calls: unknown[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			calls.push(JSON.parse(String(init?.body)));
			return jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: {
					data: [
						{
							data: {
								objectId: "0xcoin",
								type: "0x2::coin::Coin<0x2::sui::SUI>",
							},
						},
						{
							data: {
								objectId: "0xnft",
								type: "0xcollection::nft::AegisBadge",
								display: { data: { name: "Aegis Badge" } },
								content: { fields: { url: "ipfs://badge" } },
							},
						},
						{
							data: {
								objectId: "0xcap",
								type: "0xpackage::session::SessionCap",
								display: {},
							},
						},
						{
							data: {
								objectId: "0xposition",
								type: "0xpackage::position::Position",
							},
						},
					],
					nextCursor: null,
					hasNextPage: false,
				},
			});
		};

		const objects = await listOwnedInventory(wallet, { fetcher, limit: 3 });

		expect(calls).toEqual([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_getOwnedObjects",
				params: [
					wallet,
					{
						options: {
							showContent: true,
							showDisplay: true,
							showType: true,
						},
					},
					null,
					3,
				],
			},
		]);
		expect(objects).toEqual([
			{
				objectId: "0xcoin",
				type: "0x2::coin::Coin<0x2::sui::SUI>",
				displayName: "Coin<SUI>",
				kind: "coin",
			},
			{
				objectId: "0xnft",
				type: "0xcollection::nft::AegisBadge",
				displayName: "Aegis Badge",
				imageUrl: "ipfs://badge",
				kind: "collectible",
			},
			{
				objectId: "0xcap",
				type: "0xpackage::session::SessionCap",
				displayName: "SessionCap",
				kind: "capability",
			},
			{
				objectId: "0xposition",
				type: "0xpackage::position::Position",
				displayName: "Position",
				kind: "defi-position",
			},
		]);
	});

	it("builds a portfolio snapshot from balances and owned inventory", async () => {
		const fetcher: typeof fetch = async (_url, init) => {
			const request = JSON.parse(String(init?.body)) as { method: string };
			if (request.method === "suix_getAllBalances") {
				return jsonResponse({
					jsonrpc: "2.0",
					id: 1,
					result: [
						{
							coinType: "0x2::sui::SUI",
							coinObjectCount: 1,
							totalBalance: "9",
						},
					],
				});
			}

			return jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: {
					data: [
						{
							data: {
								objectId: "0xnft",
								type: "0xcollection::nft::AegisBadge",
							},
						},
						{
							data: {
								objectId: "0xcap",
								type: "0xpackage::wallet::GuardianCap",
							},
						},
						{
							data: {
								objectId: "0xposition",
								type: "0xpackage::position::Position",
							},
						},
					],
				},
			});
		};

		const portfolio = await loadWalletPortfolio(wallet, {
			fetcher,
			objectLimit: 2,
		});

		expect(portfolio.tokens).toHaveLength(1);
		expect(portfolio.collectibles.map((item) => item.objectId)).toEqual([
			"0xnft",
		]);
		expect(portfolio.capabilities.map((item) => item.objectId)).toEqual([
			"0xcap",
		]);
		expect(portfolio.defiPositions.map((item) => item.objectId)).toEqual([
			"0xposition",
		]);
		expect(portfolio.otherObjects).toEqual([]);
	});
});

const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
