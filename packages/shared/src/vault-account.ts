import type { PublicKey } from "@mysten/sui/cryptography";
import { MultiSigPublicKey } from "@mysten/sui/multisig";

export type VaultAccountInput = {
	passkeyPublicKey: PublicKey;
	enclavePublicKey: PublicKey;
};

export type RecoverableVaultAccountInput = VaultAccountInput & {
	recoveryPublicKey: PublicKey;
};

export type VaultAccount = {
	publicKey: MultiSigPublicKey;
	address: string;
	threshold: 2;
	signers: [{ role: "passkey"; weight: 1 }, { role: "enclave"; weight: 1 }];
};

export type RecoverableVaultAccount = {
	publicKey: MultiSigPublicKey;
	address: string;
	threshold: 2;
	signers: [
		{ role: "passkey"; weight: 1 },
		{ role: "enclave"; weight: 1 },
		{ role: "recovery"; weight: 1 },
	];
};

export const createVaultAccount = ({
	passkeyPublicKey,
	enclavePublicKey,
}: VaultAccountInput): VaultAccount => {
	const publicKey = MultiSigPublicKey.fromPublicKeys({
		threshold: 2,
		publicKeys: [
			{ publicKey: passkeyPublicKey, weight: 1 },
			{ publicKey: enclavePublicKey, weight: 1 },
		],
	});

	return {
		publicKey,
		address: publicKey.toSuiAddress(),
		threshold: 2,
		signers: [
			{ role: "passkey", weight: 1 },
			{ role: "enclave", weight: 1 },
		],
	};
};

export const createRecoverableVaultAccount = ({
	passkeyPublicKey,
	enclavePublicKey,
	recoveryPublicKey,
}: RecoverableVaultAccountInput): RecoverableVaultAccount => {
	const publicKey = MultiSigPublicKey.fromPublicKeys({
		threshold: 2,
		publicKeys: [
			{ publicKey: passkeyPublicKey, weight: 1 },
			{ publicKey: enclavePublicKey, weight: 1 },
			{ publicKey: recoveryPublicKey, weight: 1 },
		],
	});

	return {
		publicKey,
		address: publicKey.toSuiAddress(),
		threshold: 2,
		signers: [
			{ role: "passkey", weight: 1 },
			{ role: "enclave", weight: 1 },
			{ role: "recovery", weight: 1 },
		],
	};
};
