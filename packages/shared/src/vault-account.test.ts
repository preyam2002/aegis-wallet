import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { describe, expect, it } from "vitest";
import { NodePasskeyProvider } from "./node-passkey-provider";
import {
	createRecoverableVaultAccount,
	createVaultAccount,
} from "./vault-account";

describe("createVaultAccount", () => {
	it("builds a native threshold-2 passkey plus enclave multisig account", async () => {
		const passkeyProvider = await NodePasskeyProvider.create(
			"aegis-vault-account-test",
		);
		const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider);
		const enclave = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));

		const account = createVaultAccount({
			passkeyPublicKey: passkey.getPublicKey(),
			enclavePublicKey: enclave.getPublicKey(),
		});

		expect(account.threshold).toBe(2);
		expect(account.signers).toEqual([
			{ role: "passkey", weight: 1 },
			{ role: "enclave", weight: 1 },
		]);
		expect(account.address).toMatch(/^0x[0-9a-f]{64}$/);
		expect(account.publicKey.toSuiAddress()).toBe(account.address);
	});

	it("builds a native threshold-2 recoverable vault with a guardian-held signer", async () => {
		const passkeyProvider = await NodePasskeyProvider.create(
			"aegis-recoverable-vault-test",
		);
		const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider);
		const enclave = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
		const recovery = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(8));

		const account = createRecoverableVaultAccount({
			passkeyPublicKey: passkey.getPublicKey(),
			enclavePublicKey: enclave.getPublicKey(),
			recoveryPublicKey: recovery.getPublicKey(),
		});

		expect(account.threshold).toBe(2);
		expect(account.signers).toEqual([
			{ role: "passkey", weight: 1 },
			{ role: "enclave", weight: 1 },
			{ role: "recovery", weight: 1 },
		]);
		expect(account.address).toMatch(/^0x[0-9a-f]{64}$/);
	});
});
