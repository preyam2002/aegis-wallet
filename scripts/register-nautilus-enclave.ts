import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createTestnetGrpcClient } from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

const DEFAULT_AEGIS_PACKAGE_ID =
	"0x25989dc31ce2eb030ced1c06f0b926acabb2f893f868b1357b7032664c605d03";
const DEFAULT_ENCLAVE_PACKAGE_ID =
	"0x1c6960afd5f911c3d77c376ef96c58a93a0172e62fc3669be67839b93cc45079";
const DEFAULT_AEGIS_NAUTILUS_CAP_ID =
	"0x53d4d6fa904d4e047c048e6d5bd63d3fb75ae5549862ff613e75168af6a5ec48";

const client = createTestnetGrpcClient();
const rpcUrl =
	process.env.AEGIS_JSON_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const signer = loadActiveLocalKeypair();
const aegisPackageId = process.env.AEGIS_PACKAGE_ID ?? DEFAULT_AEGIS_PACKAGE_ID;
const enclavePackageId =
	process.env.AEGIS_ENCLAVE_PACKAGE_ID ?? DEFAULT_ENCLAVE_PACKAGE_ID;
const capId =
	process.env.AEGIS_NAUTILUS_CAP_ID ?? DEFAULT_AEGIS_NAUTILUS_CAP_ID;
const name = process.env.AEGIS_ENCLAVE_CONFIG_NAME ?? "Aegis Vault Co-signer";
const { pcr0, pcr1, pcr2 } = loadPcrs();
const attestationBytes = loadAttestationBytes();

let configId = process.env.AEGIS_ENCLAVE_CONFIG_ID;

if (!configId) {
	const tx = new Transaction();
	tx.moveCall({
		target: `${aegisPackageId}::attestation::create_enclave_config`,
		arguments: [
			tx.object(capId),
			tx.pure.string(name),
			tx.pure.vector("u8", [...hexToBytes(pcr0)]),
			tx.pure.vector("u8", [...hexToBytes(pcr1)]),
			tx.pure.vector("u8", [...hexToBytes(pcr2)]),
		],
	});

	const result = await client.core.signAndExecuteTransaction({
		signer,
		transaction: tx,
		include: { effects: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`create_enclave_config failed: ${txn.status.error}`);
	}

	configId = await findCreatedConfigObject(txn.digest);
	console.log(
		JSON.stringify(
			{
				step: "create_enclave_config",
				digest: txn.digest,
				configId,
			},
			null,
			2,
		),
	);
}

const registerTx = new Transaction();
const document = registerTx.moveCall({
	target: "0x2::nitro_attestation::load_nitro_attestation",
	arguments: [
		registerTx.pure.vector("u8", [...attestationBytes]),
		registerTx.object.clock(),
	],
});
registerTx.moveCall({
	target: `${enclavePackageId}::enclave::register_enclave`,
	typeArguments: [`${aegisPackageId}::attestation::AEGIS`],
	arguments: [registerTx.object(configId), document],
});

const registered = await client.core.signAndExecuteTransaction({
	signer,
	transaction: registerTx,
	include: { effects: true },
});
const registeredTxn = registered.Transaction ?? registered.FailedTransaction;
if (!registeredTxn.status.success) {
	throw new Error(`register_enclave failed: ${registeredTxn.status.error}`);
}

console.log(
	JSON.stringify(
		{
			step: "register_enclave",
			digest: registeredTxn.digest,
			configId,
			enclavePackageId,
			aegisPackageId,
		},
		null,
		2,
	),
);

function loadPcrs(): { pcr0: string; pcr1: string; pcr2: string } {
	const fromEnv = {
		pcr0: process.env.AEGIS_PCR0,
		pcr1: process.env.AEGIS_PCR1,
		pcr2: process.env.AEGIS_PCR2,
	};
	if (fromEnv.pcr0 && fromEnv.pcr1 && fromEnv.pcr2) {
		return {
			pcr0: assertPcr(fromEnv.pcr0, "AEGIS_PCR0"),
			pcr1: assertPcr(fromEnv.pcr1, "AEGIS_PCR1"),
			pcr2: assertPcr(fromEnv.pcr2, "AEGIS_PCR2"),
		};
	}

	const pcrPath = process.env.AEGIS_PCRS_JSON
		? resolve(process.env.AEGIS_PCRS_JSON)
		: resolve("enclave/out/pcr-values.json");
	const parsed = JSON.parse(readFileSync(pcrPath, "utf8")) as {
		pcr0?: string;
		pcr1?: string;
		pcr2?: string;
	};

	return {
		pcr0: assertPcr(parsed.pcr0, "pcr0"),
		pcr1: assertPcr(parsed.pcr1, "pcr1"),
		pcr2: assertPcr(parsed.pcr2, "pcr2"),
	};
}

function loadAttestationBytes(): Uint8Array {
	if (process.env.AEGIS_ATTESTATION_BASE64) {
		return fromBase64(process.env.AEGIS_ATTESTATION_BASE64);
	}
	if (process.env.AEGIS_ATTESTATION_PATH) {
		const parsed = JSON.parse(
			readFileSync(resolve(process.env.AEGIS_ATTESTATION_PATH), "utf8"),
		) as { attestation?: string };
		if (!parsed.attestation) {
			throw new Error("AEGIS_ATTESTATION_PATH JSON must contain attestation");
		}
		return fromBase64(parsed.attestation);
	}

	throw new Error(
		"set AEGIS_ATTESTATION_BASE64 or AEGIS_ATTESTATION_PATH before registering",
	);
}

async function findCreatedConfigObject(digest: string): Promise<string> {
	const response = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "sui_getTransactionBlock",
			params: [digest, { showObjectChanges: true }],
		}),
	});
	const json = (await response.json()) as {
		result?: {
			objectChanges?: {
				type?: string;
				objectType?: string;
				objectId?: string;
			}[];
		};
		error?: { message?: string };
	};
	if (json.error) {
		throw new Error(`sui_getTransactionBlock failed: ${json.error.message}`);
	}

	const created = json.result?.objectChanges?.find(
		(change) =>
			change.type === "created" &&
			change.objectType?.includes("::enclave::EnclaveConfig<"),
	);
	if (!created?.objectId) {
		throw new Error(`could not find created EnclaveConfig in digest ${digest}`);
	}

	return created.objectId;
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

function assertPcr(value: string | undefined, label: string): string {
	if (!value) {
		throw new Error(`${label} is required`);
	}
	const normalized = value.replace(/^0x/, "");
	if (!/^[0-9a-fA-F]{96}$/.test(normalized)) {
		throw new Error(`${label} must be a 48-byte SHA-384 hex PCR`);
	}
	return normalized.toLowerCase();
}

function hexToBytes(value: string): Uint8Array {
	const normalized = value.replace(/^0x/, "");
	const bytes = new Uint8Array(normalized.length / 2);
	for (let index = 0; index < normalized.length; index += 2) {
		bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
	}
	return bytes;
}
