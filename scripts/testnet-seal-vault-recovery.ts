import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	createRecoverableVaultAccount,
	createTestnetGrpcClient,
	NodePasskeyProvider,
	TESTNET_RPC_URL,
} from "@aegis/shared";
import { type KeyServerConfig, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import {
	buildRecoverySealApproveTransaction,
	buildSealEncryptRequests,
	combineGuardianShares,
	createGuardianRecoveryShares,
} from "../app/src/lib/recovery";

const client = createTestnetGrpcClient();
const packageId =
	process.env.AEGIS_PACKAGE_ID ??
	"0x599af3fd203d2659af114218d6c61be7ed275715da6d720cb0dc6ce043d1ef6b";
const recipient =
	process.env.AEGIS_TEST_RECIPIENT ??
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const sealServers = parseSealServers(
	process.env.AEGIS_SEAL_KEY_SERVERS ??
		"0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
);
const guardians = loadLocalKeypairs().slice(0, 2);
if (guardians.length < 2) {
	throw new Error(
		"at least two local Sui keypairs are required for recovery smoke",
	);
}

const recoverySeed = new Uint8Array(32).fill(8);
const expectedRecoveryKey = Ed25519Keypair.fromSecretKey(recoverySeed);
const activeGuardian = guardians[0];
const recoveryConfigId = await createRecoveryConfig(
	activeGuardian.keypair,
	guardians.map((guardian) => guardian.address),
);
await requestRecovery(activeGuardian.keypair, recoveryConfigId);

const recoveryShares = await createGuardianRecoveryShares({
	secret: recoverySeed,
	guardians: guardians.map((guardian) => guardian.address),
	shamirThreshold: 2,
	sealKeyServerThreshold: 1,
	recoveryConfigId,
});
const seal = new SealClient({
	suiClient: client as never,
	serverConfigs: sealServers,
	verifyKeyServers: true,
	timeout: 20_000,
});
const encryptedShares = await Promise.all(
	buildSealEncryptRequests({ packageId, shares: recoveryShares }).map(
		(request) => seal.encrypt(request),
	),
);
const decryptedShares = await Promise.all(
	recoveryShares.map(async (share, index) => {
		const guardian = guardians[index];
		const sessionKey = await SessionKey.create({
			address: guardian.address,
			packageId,
			ttlMin: 10,
			signer: guardian.keypair,
			suiClient: client as never,
		});
		const approveTx = buildRecoverySealApproveTransaction({
			packageId,
			recoveryConfigId,
			shareIdentity: share.identity,
		});
		const txBytes = await approveTx.build({
			client,
			onlyTransactionKind: true,
		});
		return {
			share: await seal.decrypt({
				data: encryptedShares[index].encryptedObject,
				sessionKey,
				txBytes,
			}),
		};
	}),
);
const recoveredSeed = await combineGuardianShares(decryptedShares);
const recoveredRecoveryKey = Ed25519Keypair.fromSecretKey(recoveredSeed);
if (
	recoveredRecoveryKey.toSuiAddress() !== expectedRecoveryKey.toSuiAddress()
) {
	throw new Error(
		"recovered signer does not match the original recovery signer",
	);
}

const passkeyProvider = await NodePasskeyProvider.create(
	"aegis-testnet-seal-vault-recovery",
);
const passkey = await PasskeyKeypair.getPasskeyInstance(
	passkeyProvider,
	"aegis-testnet-seal-vault-recovery",
);
const enclave = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const vault = createRecoverableVaultAccount({
	passkeyPublicKey: passkey.getPublicKey(),
	enclavePublicKey: enclave.getPublicKey(),
	recoveryPublicKey: recoveredRecoveryKey.getPublicKey(),
});
await fundVault(activeGuardian.keypair, vault.address);
await waitForBalance(vault.address, 20_000_000n);

const tx = new Transaction();
tx.setSender(vault.address);
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
tx.transferObjects([coin], tx.pure.address(recipient));
const txBytes = await tx.build({ client });
const { signature: passkeySig } = await passkey.signTransaction(txBytes);
const { signature: recoverySig } =
	await recoveredRecoveryKey.signTransaction(txBytes);
const combined = vault.publicKey.combinePartialSignatures([
	passkeySig,
	recoverySig,
]);
const result = await client.core.executeTransaction({
	transaction: txBytes,
	signatures: [combined],
	include: { effects: true, transaction: true },
});
const txn = result.Transaction ?? result.FailedTransaction;
if (!txn.status.success) {
	throw new Error(`recovered vault transaction failed: ${txn.status.error}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			packageId,
			recoveryConfigId,
			vaultAddress: vault.address,
			digest: txn.digest,
			guardianCount: guardians.length,
			sealKeyServers: sealServers.map((server) => server.objectId),
			signers: "passkey+seal-recovered-ed25519",
		},
		null,
		2,
	),
);

async function createRecoveryConfig(
	signer: LoadedKeypair,
	guardianAddresses: string[],
): Promise<string> {
	const tx = new Transaction();
	tx.moveCall({
		target: `${packageId}::recovery::create_config`,
		arguments: [
			tx.pure.u64(2n),
			tx.pure.u64(0n),
			tx.pure.vector("address", guardianAddresses),
		],
	});
	const result = await signer.signAndExecuteTransaction({
		transaction: tx,
		client,
		include: { effects: true, transaction: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`create recovery config failed: ${txn.status.error}`);
	}

	return findCreatedRecoveryConfig(txn.digest);
}

async function requestRecovery(
	signer: LoadedKeypair,
	recoveryConfigId: string,
) {
	const tx = new Transaction();
	tx.moveCall({
		target: `${packageId}::recovery::request_recovery`,
		arguments: [tx.object(recoveryConfigId), tx.object.clock()],
	});
	const result = await signer.signAndExecuteTransaction({
		transaction: tx,
		client,
		include: { effects: true, transaction: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`request recovery failed: ${txn.status.error}`);
	}
}

async function fundVault(signer: LoadedKeypair, vaultAddress: string) {
	const tx = new Transaction();
	const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(30_000_000n)]);
	tx.transferObjects([coin], tx.pure.address(vaultAddress));
	const result = await signer.signAndExecuteTransaction({
		transaction: tx,
		client,
		include: { effects: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`fund recoverable vault failed: ${txn.status.error}`);
	}
}

async function waitForBalance(address: string, minimumMist: bigint) {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		const { balance } = await client.core.getBalance({ owner: address });
		if (BigInt(balance.balance) >= minimumMist) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(
		`recoverable vault ${address} did not reach ${minimumMist.toString()} MIST`,
	);
}

async function findCreatedRecoveryConfig(digest: string): Promise<string> {
	let lastError = "";

	for (let attempt = 0; attempt < 20; attempt += 1) {
		const response = await fetch(TESTNET_RPC_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "sui_getTransactionBlock",
				params: [digest, { showObjectChanges: true }],
			}),
		});
		const body = (await response.json()) as {
			result?: {
				objectChanges?: {
					type?: string;
					objectType?: string;
					objectId?: string;
				}[];
			};
			error?: { message?: string };
		};
		if (body.error) {
			lastError = body.error.message ?? "unknown error";
			await new Promise((resolve) => setTimeout(resolve, 500));
			continue;
		}

		const created = body.result?.objectChanges?.find(
			(change) =>
				change.type === "created" &&
				change.objectType?.endsWith("::recovery::RecoveryConfig"),
		);
		if (created?.objectId) {
			return created.objectId;
		}

		lastError = "created RecoveryConfig not found in objectChanges";
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(
		`could not find created RecoveryConfig in digest ${digest}: ${lastError}`,
	);
}

function parseSealServers(value: string): KeyServerConfig[] {
	const configs = value
		.split(",")
		.map((objectId) => objectId.trim())
		.filter(Boolean)
		.map((objectId) => ({ objectId, weight: 1 }));
	if (configs.length === 0) {
		throw new Error("at least one Seal key-server object ID is required");
	}
	return configs;
}

type LoadedKeypair = Ed25519Keypair | Secp256k1Keypair | Secp256r1Keypair;

function loadLocalKeypairs(): { keypair: LoadedKeypair; address: string }[] {
	const config = readFileSync(
		join(homedir(), ".sui", "sui_config", "client.yaml"),
		"utf8",
	);
	const activeAddress = config
		.match(/active[-_]address:\s*"?([^"\n]+)"?/)?.[1]
		?.trim();
	const entries = JSON.parse(
		readFileSync(join(homedir(), ".sui", "sui_config", "sui.keystore"), "utf8"),
	) as string[];
	const loaded = entries.map((entry) => {
		const keypair = keypairFromLegacyKeystoreEntry(entry);
		return { keypair, address: keypair.toSuiAddress() };
	});

	return loaded.sort((left, right) => {
		if (left.address.toLowerCase() === activeAddress?.toLowerCase()) {
			return -1;
		}
		if (right.address.toLowerCase() === activeAddress?.toLowerCase()) {
			return 1;
		}
		return 0;
	});
}

function keypairFromLegacyKeystoreEntry(entry: string): LoadedKeypair {
	const bytes = fromBase64(entry);
	const scheme = bytes[0];
	const secretKey = bytes.slice(1);

	if (scheme === 0) {
		return Ed25519Keypair.fromSecretKey(secretKey);
	}
	if (scheme === 1) {
		return Secp256k1Keypair.fromSecretKey(secretKey);
	}
	if (scheme === 2) {
		return Secp256r1Keypair.fromSecretKey(secretKey);
	}

	throw new Error(`unsupported Sui keystore scheme byte ${scheme}`);
}
