import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createTestnetGrpcClient, TESTNET_RPC_URL } from "@aegis/shared";
import { type KeyServerConfig, SealClient, SessionKey } from "@mysten/seal";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import {
	buildRecoverySealApproveTransaction,
	buildSealShareIdentity,
} from "../app/src/lib/recovery";

const client = createTestnetGrpcClient();
const signer = loadActiveLocalKeypair();
const sender = signer.toSuiAddress();
const packageId =
	process.env.AEGIS_PACKAGE_ID ??
	"0x599af3fd203d2659af114218d6c61be7ed275715da6d720cb0dc6ce043d1ef6b";
const backupGuardian =
	process.env.AEGIS_BACKUP_GUARDIAN ??
	"0xc13f795a75bfd490644d739473710a15b2bf5bffa670c0dd76a7d5a9dafdcc66";
const sealServers = parseSealServers(
	process.env.AEGIS_SEAL_KEY_SERVERS ??
		"0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
);

const recoveryConfigId = await createRecoveryConfig([sender, backupGuardian]);
await requestRecovery(recoveryConfigId);

const shareIdentity = buildSealShareIdentity(recoveryConfigId, 1);
const plaintext = new TextEncoder().encode("aegis recovery seal smoke");
const seal = new SealClient({
	suiClient: client as never,
	serverConfigs: sealServers,
	verifyKeyServers: true,
	timeout: 20_000,
});
const { encryptedObject } = await seal.encrypt({
	threshold: 1,
	packageId,
	id: shareIdentity,
	data: plaintext,
});
const sessionKey = await SessionKey.create({
	address: sender,
	packageId,
	ttlMin: 10,
	signer,
	suiClient: client as never,
});
const approveTx = buildRecoverySealApproveTransaction({
	packageId,
	recoveryConfigId,
	shareIdentity,
});
const txBytes = await approveTx.build({ client, onlyTransactionKind: true });
const decrypted = await seal.decrypt({
	data: encryptedObject,
	sessionKey,
	txBytes,
});

if (
	new TextDecoder().decode(decrypted) !== new TextDecoder().decode(plaintext)
) {
	throw new Error("Seal decrypted plaintext did not match the recovery share");
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			packageId,
			recoveryConfigId,
			guardian: sender,
			shareIdentity,
			sealKeyServers: sealServers.map((server) => server.objectId),
			decryptedBytes: decrypted.length,
		},
		null,
		2,
	),
);

async function createRecoveryConfig(guardians: string[]): Promise<string> {
	const tx = new Transaction();
	tx.moveCall({
		target: `${packageId}::recovery::create_config`,
		arguments: [
			tx.pure.u64(2n),
			tx.pure.u64(0n),
			tx.pure.vector("address", guardians),
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

async function requestRecovery(recoveryConfigId: string) {
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

function loadActiveLocalKeypair() {
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

	for (const entry of entries) {
		const keypair = keypairFromLegacyKeystoreEntry(entry);
		if (
			!activeAddress ||
			keypair.toSuiAddress().toLowerCase() === activeAddress.toLowerCase()
		) {
			return keypair;
		}
	}

	throw new Error(
		`no local keystore key matched active address ${activeAddress}`,
	);
}

function keypairFromLegacyKeystoreEntry(entry: string) {
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
