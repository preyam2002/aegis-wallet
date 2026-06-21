import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createTestnetGrpcClient, NodePasskeyProvider } from "@aegis/shared";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";

type HealthResponse = {
	status: string;
	publicKey: string;
};

type AttestationResponse = {
	mode: "nitro-attested" | "local-unattested";
	publicKey: string;
	attestation?: string | null;
};

type CoSignResponse =
	| { ok: true; enclaveSig: string }
	| { ok: false; reason: string; rejectionReceipt?: string };

const client = createTestnetGrpcClient();
const AEGIS_PACKAGE_ID =
	process.env.AEGIS_PACKAGE_ID ??
	"0x25989dc31ce2eb030ced1c06f0b926acabb2f893f868b1357b7032664c605d03";
const POLICY_CAP_ID =
	process.env.AEGIS_POLICY_CAP_ID ??
	"0x9a0fe306cb2349e19c8e52a6a8ba3a5dbf2234b2f884fad44cabc144eb57d242";
const LIVE_POLICY_OBJECT_ID =
	process.env.AEGIS_POLICY_OBJECT_ID ??
	"0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea";
const LIVE_POLICY_ALLOWED_RECIPIENT =
	process.env.AEGIS_TEST_RECIPIENT ??
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const SEEDED_DRAIN_RECIPIENT =
	"0x000000000000000000000000000000000000000000000000000000000000dEaD";
const enclaveSeedHex = "07".repeat(32);
const remoteEnclaveUrl = process.env.AEGIS_ENCLAVE_URL;
const enclave = await connectEnclave();
const attestation = await getAttestation(enclave.url);
if (attestation.publicKey !== enclave.health.publicKey) {
	throw new Error("attestation public key does not match health public key");
}
if (remoteEnclaveUrl && attestation.mode !== "nitro-attested") {
	throw new Error(
		`remote enclave must be nitro-attested, got ${attestation.mode}`,
	);
}
if (remoteEnclaveUrl && !attestation.attestation) {
	throw new Error(
		"remote nitro-attested enclave did not return attestation bytes",
	);
}
await assertRegisteredEnclaveMatches(enclave.health.publicKey);

const enclavePublicKey = new Ed25519PublicKey(
	hexToBytes(enclave.health.publicKey),
);
const passkeyProvider = await NodePasskeyProvider.create("aegis-testnet-vault");
const passkey = await PasskeyKeypair.getPasskeyInstance(
	passkeyProvider,
	"aegis-testnet-vault",
);
const multisig = MultiSigPublicKey.fromPublicKeys({
	threshold: 2,
	publicKeys: [
		{ publicKey: passkey.getPublicKey(), weight: 1 },
		{ publicKey: enclavePublicKey, weight: 1 },
	],
});
const vaultAddress = multisig.toSuiAddress();

await ensureFunded(vaultAddress);

try {
	const tx = new Transaction();
	tx.setSender(vaultAddress);
	const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
	tx.transferObjects([coin], tx.pure.address(LIVE_POLICY_ALLOWED_RECIPIENT));
	const txBytes = await tx.build({ client });
	const { signature: userSig } = await passkey.signTransaction(txBytes);
	const response = await coSign(enclave.url, {
		txBytes: Buffer.from(txBytes).toString("base64"),
		userSig,
		vaultAddress,
	});

	if (!response.ok) {
		throw new Error(`co_sign refused benign tx: ${response.reason}`);
	}

	const combined = multisig.combinePartialSignatures([
		userSig,
		response.enclaveSig,
	]);
	const result = await client.core.executeTransaction({
		transaction: txBytes,
		signatures: [combined],
		include: { effects: true, transaction: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`vault multisig transaction failed: ${txn.status.error}`);
	}

	const drainTx = new Transaction();
	drainTx.setSender(vaultAddress);
	const [drainCoin] = drainTx.splitCoins(drainTx.gas, [drainTx.pure.u64(1n)]);
	drainTx.transferObjects(
		[drainCoin],
		drainTx.pure.address(SEEDED_DRAIN_RECIPIENT),
	);
	const drainBytes = await drainTx.build({ client });
	const { signature: drainUserSig } = await passkey.signTransaction(drainBytes);
	const refused = await coSign(enclave.url, {
		txBytes: Buffer.from(drainBytes).toString("base64"),
		userSig: drainUserSig,
		vaultAddress,
	});

	if (refused.ok || refused.reason !== "recipient is not allowlisted") {
		throw new Error(
			`expected server-side drain refusal, got ${JSON.stringify(refused)}`,
		);
	}
	const policyRejectedDigest = await recordPolicyRejectedReceipt(
		createHash("sha256").update(drainBytes).digest(),
		refused.reason,
	);

	console.log(
		JSON.stringify(
			{
				network: "testnet",
				vaultAddress,
				digest: txn.digest,
				policyObjectId: LIVE_POLICY_OBJECT_ID,
				registeredEnclaveId: process.env.AEGIS_REGISTERED_ENCLAVE_ID ?? null,
				enclavePublicKey: enclave.health.publicKey,
				attestationMode: attestation.mode,
				recipient: LIVE_POLICY_ALLOWED_RECIPIENT,
				refusalReason: refused.reason,
				policyRejectedDigest,
				status: txn.status,
				signer: remoteEnclaveUrl
					? "passkey+nitro-attested-enclave-ed25519"
					: "passkey+local-enclave-ed25519",
			},
			null,
			2,
		),
	);
} finally {
	enclave.cleanup();
}

async function connectEnclave(): Promise<{
	url: string;
	health: HealthResponse;
	cleanup: () => void;
}> {
	if (remoteEnclaveUrl) {
		const health = await getHealth(remoteEnclaveUrl);
		return { url: remoteEnclaveUrl, health, cleanup: () => {} };
	}

	const port = "3319";
	const server = spawn("cargo", ["run", "--quiet"], {
		cwd: new URL("../enclave/", import.meta.url),
		env: {
			...process.env,
			CARGO_HOME: process.env.CARGO_HOME ?? "/private/tmp/aegis-cargo",
			AEGIS_ALLOWED_RECIPIENTS: LIVE_POLICY_ALLOWED_RECIPIENT,
			AEGIS_ALLOWED_PACKAGES: "0x2",
			AEGIS_ENCLAVE_PORT: port,
			AEGIS_MAX_OUTFLOW_BPS: "2500",
			AEGIS_POLICY_OBJECT_ID: LIVE_POLICY_OBJECT_ID,
			AEGIS_PER_TX_CAP_MIST: "1000000000",
			AEGIS_ROLLING_DAILY_CAP_MIST: "5000000000",
			AEGIS_SIGNING_SEED_HEX: enclaveSeedHex,
			AEGIS_TOTAL_MIST: "10000000000",
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stderr = "";
	server.stderr.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	const url = `http://127.0.0.1:${port}`;
	const health = await waitForHealth(url, () => stderr);
	return {
		url,
		health,
		cleanup: () => {
			server.kill("SIGTERM");
		},
	};
}

async function recordPolicyRejectedReceipt(
	txDigestBytes: Uint8Array,
	reason: string,
): Promise<string> {
	const tx = new Transaction();
	tx.moveCall({
		target: `${AEGIS_PACKAGE_ID}::policy::record_policy_rejected`,
		arguments: [
			tx.object(LIVE_POLICY_OBJECT_ID),
			tx.pure.vector("u8", [...txDigestBytes]),
			tx.pure.vector("u8", [...new TextEncoder().encode(reason)]),
			tx.object(POLICY_CAP_ID),
		],
	});

	const result = await client.core.signAndExecuteTransaction({
		signer: loadActiveLocalKeypair(),
		transaction: tx,
		include: { effects: true, events: true },
	});
	const txn = result.Transaction ?? result.FailedTransaction;
	if (!txn.status.success) {
		throw new Error(`record_policy_rejected failed: ${txn.status.error}`);
	}

	return txn.digest;
}

async function ensureFunded(address: string) {
	const { balance } = await client.core.getBalance({ owner: address });
	if (BigInt(balance.balance) > 20_000_000n) {
		return;
	}

	fundFromLocalWallet(address);

	for (let attempt = 0; attempt < 20; attempt += 1) {
		const next = await client.core.getBalance({ owner: address });
		if (BigInt(next.balance.balance) > 0n) {
			return;
		}
		await delay(1_000);
	}

	throw new Error(`funding did not appear for vault ${address}`);
}

function fundFromLocalWallet(recipient: string) {
	const configPath = createWritableSuiConfig();

	try {
		const coins = JSON.parse(
			execFileSync(
				"sui",
				["client", "--client.config", configPath, "--json", "gas"],
				{
					encoding: "utf8",
				},
			),
		) as { gasCoinId?: string; mistBalance?: string }[];
		const coin = coins
			.filter((candidate) => BigInt(candidate.mistBalance ?? "0") > 50_000_000n)
			.sort((left, right) =>
				Number(
					BigInt(right.mistBalance ?? "0") - BigInt(left.mistBalance ?? "0"),
				),
			)[0];

		if (!coin?.gasCoinId) {
			throw new Error(
				"No local testnet gas coin has enough MIST to fund vault smoke test",
			);
		}

		execFileSync(
			"sui",
			[
				"client",
				"--client.config",
				configPath,
				"--json",
				"transfer-sui",
				"--to",
				recipient,
				"--sui-coin-object-id",
				coin.gasCoinId,
				"--amount",
				"30000000",
				"--gas-budget",
				"5000000",
			],
			{ encoding: "utf8" },
		);
	} finally {
		rmSync(configPath.replace(/\/client\.yaml$/, ""), {
			recursive: true,
			force: true,
		});
	}
}

function createWritableSuiConfig(): string {
	const sourceDir = join(homedir(), ".sui", "sui_config");
	const tempDir = mkdtempSync(join(tmpdir(), "aegis-sui-config-"));
	const configPath = join(tempDir, "client.yaml");
	const keystorePath = join(tempDir, "sui.keystore");

	copyFileSync(join(sourceDir, "sui.keystore"), keystorePath);
	const config = readFileSync(join(sourceDir, "client.yaml"), "utf8").replace(
		/File: .+sui\.keystore/,
		`File: ${keystorePath}`,
	);
	writeFileSync(configPath, config);

	return configPath;
}

async function waitForHealth(
	url: string,
	stderr: () => string,
): Promise<HealthResponse> {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(`${url}/health_check`);
			if (response.ok) {
				return (await response.json()) as HealthResponse;
			}
		} catch {
			await delay(100);
		}
	}

	throw new Error(`enclave server did not become healthy. stderr: ${stderr()}`);
}

async function getHealth(url: string): Promise<HealthResponse> {
	const response = await fetch(`${url}/health_check`);
	if (!response.ok) {
		throw new Error(
			`health_check HTTP ${response.status}: ${await response.text()}`,
		);
	}

	return (await response.json()) as HealthResponse;
}

async function getAttestation(url: string): Promise<AttestationResponse> {
	const response = await fetch(`${url}/get_attestation`);
	if (!response.ok) {
		throw new Error(
			`get_attestation HTTP ${response.status}: ${await response.text()}`,
		);
	}

	return (await response.json()) as AttestationResponse;
}

async function assertRegisteredEnclaveMatches(publicKeyHex: string) {
	const enclaveId = process.env.AEGIS_REGISTERED_ENCLAVE_ID;
	if (!enclaveId) {
		return;
	}

	const response = await fetch("https://fullnode.testnet.sui.io:443", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "sui_getObject",
			params: [enclaveId, { showContent: true }],
		}),
	});
	if (!response.ok) {
		throw new Error(`sui_getObject HTTP ${response.status}`);
	}

	const body = (await response.json()) as {
		result?: {
			data?: {
				content?: {
					fields?: {
						pk?: number[];
					};
				};
			};
		};
		error?: { message?: string };
	};
	if (body.error) {
		throw new Error(`sui_getObject failed: ${body.error.message}`);
	}

	const registeredPk = body.result?.data?.content?.fields?.pk;
	if (!registeredPk) {
		throw new Error(`registered enclave ${enclaveId} did not expose pk`);
	}

	const registeredHex = Buffer.from(registeredPk).toString("hex");
	if (registeredHex !== publicKeyHex.toLowerCase()) {
		throw new Error(
			`registered enclave public key ${registeredHex} did not match live enclave ${publicKeyHex}`,
		);
	}
}

async function coSign(url: string, body: unknown): Promise<CoSignResponse> {
	const response = await fetch(`${url}/co_sign`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(
			`co_sign HTTP ${response.status}: ${await response.text()}`,
		);
	}

	return (await response.json()) as CoSignResponse;
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

function hexToBytes(hex: string): Uint8Array {
	return Uint8Array.from(Buffer.from(hex, "hex"));
}
