import { NodePasskeyProvider } from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { describe, expect, it } from "vitest";
import {
	createRecoverableVaultAccountFromPasskeyProvider,
	createVaultAccountFromPasskeyProvider,
} from "./vault-opt-in";

describe("vault opt-in", () => {
	it("creates the passkey plus enclave 2-of-2 account from a passkey provider", async () => {
		const provider = await NodePasskeyProvider.create(
			"aegis-vault-opt-in-test",
		);
		const enclave = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));

		const account = await createVaultAccountFromPasskeyProvider({
			provider,
			enclavePublicKey: enclave.getPublicKey(),
		});

		expect(account.threshold).toBe(2);
		expect(account.signers.map((signer) => signer.role)).toEqual([
			"passkey",
			"enclave",
		]);
		expect(account.address).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it("creates the recoverable 2-of-3 vault account from a passkey provider", async () => {
		const provider = await NodePasskeyProvider.create(
			"aegis-recoverable-vault-opt-in-test",
		);
		const enclave = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
		const recovery = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(10));

		const account = await createRecoverableVaultAccountFromPasskeyProvider({
			provider,
			enclavePublicKey: enclave.getPublicKey(),
			recoveryPublicKey: recovery.getPublicKey(),
		});

		expect(account.threshold).toBe(2);
		expect(account.signers.map((signer) => signer.role)).toEqual([
			"passkey",
			"enclave",
			"recovery",
		]);
	});
});
