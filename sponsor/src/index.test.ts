import { describe, expect, it } from "vitest";
import { createSponsorService, loadSponsorConfig } from "./index";

describe("Enoki sponsor control plane", () => {
	it("loads private Enoki config and backend allowlists from env", () => {
		expect(
			loadSponsorConfig({
				ENOKI_PRIVATE_API_KEY: "enoki_private",
				ENOKI_NETWORK: "mainnet",
				ENOKI_ALLOWED_ADDRESSES: "0xaaa, 0xbbb",
				ENOKI_ALLOWED_MOVE_CALL_TARGETS:
					"0x2::sui::transfer, 0x3::sui_system::request_add_stake",
			}),
		).toEqual({
			apiKey: "enoki_private",
			network: "mainnet",
			allowedAddresses: ["0xaaa", "0xbbb"],
			allowedMoveCallTargets: [
				"0x2::sui::transfer",
				"0x3::sui_system::request_add_stake",
			],
		});
	});

	it("rejects startup without the private Enoki API key", () => {
		expect(() => loadSponsorConfig({})).toThrow(
			"ENOKI_PRIVATE_API_KEY is required",
		);
	});

	it("creates sponsored transactions with backend-controlled policy", async () => {
		const calls: unknown[] = [];
		const service = createSponsorService({
			config: {
				apiKey: "enoki_private",
				network: "testnet",
				allowedMoveCallTargets: ["0x2::sui::transfer"],
			},
			client: {
				async createSponsoredTransaction(input: unknown) {
					calls.push(input);
					return { bytes: "AAECAw==", digest: "digest-1" };
				},
				async executeSponsoredTransaction(input: unknown) {
					calls.push(input);
					return { digest: "digest-1" };
				},
			},
		});

		const sponsored = await service.create({
			sender: "0xsender",
			transactionKindBytes: "AAECAw==",
		});
		const executed = await service.execute({
			digest: sponsored.digest,
			signature: "user-signature",
		});

		expect(sponsored).toEqual({ bytes: "AAECAw==", digest: "digest-1" });
		expect(executed).toEqual({ digest: "digest-1" });
		expect(calls).toEqual([
			{
				network: "testnet",
				sender: "0xsender",
				transactionKindBytes: "AAECAw==",
				allowedAddresses: ["0xsender"],
				allowedMoveCallTargets: ["0x2::sui::transfer"],
			},
			{ digest: "digest-1", signature: "user-signature" },
		]);
	});
});
