import { describe, expect, it } from "vitest";
import {
	buildEnokiWalletRegistrationOptions,
	buildSponsoredTransactionInput,
	createSponsoredGasTransaction,
	enokiWalletProviders,
	executeSponsoredGasTransaction,
	getOnboardingStatus,
} from "./onboarding";

describe("Enoki onboarding wrapper", () => {
	it("uses the verified Enoki wallet providers", () => {
		expect(enokiWalletProviders).toEqual(["google", "twitch", "facebook"]);
	});

	it("builds the sponsored transaction payload expected by Enoki 1.0.8", () => {
		expect(
			buildSponsoredTransactionInput({
				network: "testnet",
				sender: "0xsender",
				transactionKindBytes: "AAECAw==",
				allowedAddresses: ["0xsender"],
				allowedMoveCallTargets: ["0x2::sui::transfer"],
			}),
		).toEqual({
			network: "testnet",
			sender: "0xsender",
			transactionKindBytes: "AAECAw==",
			allowedAddresses: ["0xsender"],
			allowedMoveCallTargets: ["0x2::sui::transfer"],
		});
	});

	it("reports live sponsorship as blocked without an API key", () => {
		expect(getOnboardingStatus(undefined)).toEqual({
			zkLogin: "configured",
			sponsoredGas: "blocked",
			reason: "missing Enoki API key",
		});
	});

	it("builds Enoki wallet registration options from configured provider client IDs", () => {
		const client = { core: {} };

		expect(
			buildEnokiWalletRegistrationOptions({
				apiKey: "enoki_public",
				client,
				network: "testnet",
				redirectUrl: "https://aegis.test/auth",
				providerClientIds: {
					google: "google-client",
					twitch: "twitch-client",
				},
			}),
		).toEqual({
			apiKey: "enoki_public",
			client,
			network: "testnet",
			providers: {
				google: {
					clientId: "google-client",
					redirectUrl: "https://aegis.test/auth",
				},
				twitch: {
					clientId: "twitch-client",
					redirectUrl: "https://aegis.test/auth",
				},
			},
		});
	});

	it("calls the Enoki sponsored transaction control-plane with the verified payload shape", async () => {
		const calls: unknown[] = [];
		const client = {
			async createSponsoredTransaction(input: unknown) {
				calls.push(input);
				return { bytes: "AAECAw==", digest: "digest-1" };
			},
			async executeSponsoredTransaction(input: unknown) {
				calls.push(input);
				return { digest: "digest-1" };
			},
		};

		const sponsored = await createSponsoredGasTransaction(client, {
			network: "testnet",
			sender: "0xsender",
			transactionKindBytes: "AAECAw==",
			allowedAddresses: ["0xsender"],
		});
		const executed = await executeSponsoredGasTransaction(client, {
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
			},
			{ digest: "digest-1", signature: "user-signature" },
		]);
	});
});
