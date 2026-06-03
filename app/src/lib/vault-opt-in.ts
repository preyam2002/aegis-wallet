import {
	createRecoverableVaultAccount,
	createVaultAccount,
	type RecoverableVaultAccount,
	type VaultAccount,
} from "@aegis/shared";
import type { PublicKey } from "@mysten/sui/cryptography";
import {
	BrowserPasskeyProvider,
	type BrowserPasswordProviderOptions,
	PasskeyKeypair,
	type PasskeyProvider,
} from "@mysten/sui/keypairs/passkey";

export type VaultOptInInput = {
	provider: PasskeyProvider;
	enclavePublicKey: PublicKey;
};

export type RecoverableVaultOptInInput = VaultOptInInput & {
	recoveryPublicKey: PublicKey;
};

export const createVaultAccountFromPasskeyProvider = async ({
	provider,
	enclavePublicKey,
}: VaultOptInInput): Promise<VaultAccount> => {
	const passkey = await PasskeyKeypair.getPasskeyInstance(provider);
	return createVaultAccount({
		passkeyPublicKey: passkey.getPublicKey(),
		enclavePublicKey,
	});
};

export const createRecoverableVaultAccountFromPasskeyProvider = async ({
	provider,
	enclavePublicKey,
	recoveryPublicKey,
}: RecoverableVaultOptInInput): Promise<RecoverableVaultAccount> => {
	const passkey = await PasskeyKeypair.getPasskeyInstance(provider);
	return createRecoverableVaultAccount({
		passkeyPublicKey: passkey.getPublicKey(),
		enclavePublicKey,
		recoveryPublicKey,
	});
};

export const createBrowserVaultPasskeyProvider = (
	name = "Aegis Vault",
	options: BrowserPasswordProviderOptions = {},
): BrowserPasskeyProvider => new BrowserPasskeyProvider(name, options);
