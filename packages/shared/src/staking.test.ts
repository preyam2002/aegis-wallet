import { describe, expect, it } from "vitest";
import { loadStakingOverview } from "./staking";

const wallet =
	"0xabc0000000000000000000000000000000000000000000000000000000000001";

describe("staking overview", () => {
	it("loads wallet stakes and active validators from testnet RPC", async () => {
		const calls: unknown[] = [];
		const fetcher: typeof fetch = async (_url, init) => {
			const request = JSON.parse(String(init?.body)) as { method: string };
			calls.push(request);

			if (request.method === "suix_getStakes") {
				return jsonResponse({
					jsonrpc: "2.0",
					id: 1,
					result: [
						{
							validatorAddress: "0xvalidator1",
							stakingPool: "0xpool1",
							stakes: [
								{
									stakedSuiId: "0xstake1",
									principal: "1000000000",
									status: "Active",
									estimatedReward: "12345",
									stakeActiveEpoch: "10",
								},
							],
						},
					],
				});
			}

			return jsonResponse({
				jsonrpc: "2.0",
				id: 1,
				result: {
					epoch: "1119",
					activeValidators: [
						{
							suiAddress: "0xvalidator2",
							name: "Beta Validator",
							stakingPoolSuiBalance: "20",
						},
						{
							suiAddress: "0xvalidator1",
							name: "Alpha Validator",
							stakingPoolSuiBalance: "100",
						},
					],
				},
			});
		};

		const overview = await loadStakingOverview(wallet, { fetcher });

		expect(calls).toEqual([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_getStakes",
				params: [wallet],
			},
			{
				jsonrpc: "2.0",
				id: 1,
				method: "suix_getLatestSuiSystemState",
				params: [],
			},
		]);
		expect(overview).toEqual({
			epoch: "1119",
			positions: [
				{
					validatorAddress: "0xvalidator1",
					validatorName: "Alpha Validator",
					stakingPool: "0xpool1",
					stakedSuiId: "0xstake1",
					principalMist: "1000000000",
					estimatedRewardMist: "12345",
					status: "active",
					stakeActiveEpoch: "10",
				},
			],
			activeValidatorCount: 2,
			topValidators: [
				{
					address: "0xvalidator1",
					name: "Alpha Validator",
					stakingPoolSuiBalance: "100",
				},
				{
					address: "0xvalidator2",
					name: "Beta Validator",
					stakingPoolSuiBalance: "20",
				},
			],
		});
	});
});

const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
