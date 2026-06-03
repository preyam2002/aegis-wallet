import { describe, expect, it } from "vitest";
import { loadLiveWalletSnapshot } from "./wallet-snapshot";

const wallet =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";

describe("loadLiveWalletSnapshot", () => {
	it("maps live portfolio, prices, object buckets, and activity into dashboard rows", async () => {
		const snapshot = await loadLiveWalletSnapshot(wallet, {
			loadPortfolio: async () => ({
				tokens: [
					{
						coinType: "0x2::sui::SUI",
						symbol: "SUI",
						coinObjectCount: 2,
						totalBalance: "2500000000",
					},
					{
						coinType: "0xpackage::bbeth::BBETH",
						symbol: "BBETH",
						coinObjectCount: 1,
						totalBalance: "123000000000",
					},
				],
				collectibles: [
					{
						objectId: "0xnft",
						type: "0xcollection::nft::Badge",
						displayName: "Aegis Badge",
						kind: "collectible",
						imageUrl: "ipfs://badge",
					},
				],
				capabilities: [
					{
						objectId: "0xcap",
						type: "0xpackage::wallet::GuardianCap",
						displayName: "GuardianCap",
						kind: "capability",
					},
				],
				defiPositions: [
					{
						objectId: "0xposition",
						type: "0xpackage::position::Position",
						displayName: "Position",
						kind: "defi-position",
					},
				],
				otherObjects: [],
			}),
			fetchSuiUsdPrice: async () => ({
				coinType: "0x2::sui::SUI",
				decimals: 9,
				usdPrice: 1.25,
			}),
			loadTokenMetadata: async () => [
				{
					coinType: "0xpackage::bbeth::BBETH",
					decimals: 9,
					name: "AlphaTest ETH",
					symbol: "bbETH",
				},
			],
			listActivity: async () => [
				{
					id: "send",
					digest: "send",
					direction: "outbound",
					amountMist: "1000000000",
					coinType: "0x2::sui::SUI",
					label: "Sent SUI",
					status: "success",
				},
				{
					id: "receive",
					digest: "receive",
					direction: "inbound",
					amountMist: "250000000",
					coinType: "0x2::sui::SUI",
					label: "Received SUI",
					status: "failure",
				},
			],
			loadStaking: async () => ({
				epoch: "1119",
				positions: [
					{
						validatorAddress: "0xvalidator1",
						validatorName: "Alpha Validator",
						stakedSuiId: "0xstake1",
						principalMist: "1000000000",
						estimatedRewardMist: "12345",
						status: "active",
					},
				],
				activeValidatorCount: 101,
				topValidators: [],
			}),
		});

		expect(snapshot).toEqual({
			address: wallet,
			totalUsdValue: "$3.13",
			portfolioRows: [
				{
					symbol: "SUI",
					name: "SUI",
					amount: "2.5",
					value: "$3.13",
					priced: true,
				},
				{
					symbol: "bbETH",
					name: "AlphaTest ETH",
					amount: "123",
					value: "Unpriced",
					priced: false,
				},
			],
			activityRows: [
				{
					id: "send",
					label: "Sent SUI",
					value: "-1 SUI",
					status: "Passed",
				},
				{
					id: "receive",
					label: "Received SUI",
					value: "+0.25 SUI",
					status: "Failed",
				},
			],
			nftRows: [
				{
					id: "0xnft",
					name: "Aegis Badge",
					collection: "Badge",
					imageUrl: "ipfs://badge",
				},
			],
			defiRows: [
				{
					id: "0xposition",
					protocol: "position",
					label: "Position",
					value: "0xposition",
				},
			],
			stakingRows: [
				{
					id: "0xstake1",
					validator: "Alpha Validator",
					status: "active",
					principal: "1 SUI",
					rewards: "0.000012345 SUI",
				},
			],
			activeValidatorCount: 101,
			capabilityCount: 1,
			otherObjectCount: 0,
		});
	});
});
