import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { NodePasskeyProvider } from "@aegis/shared";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { MultiSigPublicKey } from "@mysten/sui/multisig";

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

const ENCLAVE_PORT = "3318";
const ENCLAVE_URL = `http://127.0.0.1:${ENCLAVE_PORT}`;

const server = spawn("cargo", ["run", "--quiet"], {
	cwd: new URL("../enclave/", import.meta.url),
	env: {
		...process.env,
		CARGO_HOME: process.env.CARGO_HOME ?? "/private/tmp/aegis-cargo",
		AEGIS_ALLOWED_RECIPIENTS: "0xfriend",
		AEGIS_ALLOWED_PACKAGES: "0x2",
		AEGIS_ALLOW_CALLER_POLICY_REQUESTS: "true",
		AEGIS_ENCLAVE_PORT: ENCLAVE_PORT,
		AEGIS_MAX_OUTFLOW_BPS: "2500",
		AEGIS_TOTAL_MIST: "10000000000",
	},
	stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
server.stderr.on("data", (chunk) => {
	stderr += chunk.toString();
});

try {
	const health = await waitForHealth();
	const attestation = await getAttestation();
	if (attestation.publicKey !== health.publicKey) {
		throw new Error("attestation public key does not match health public key");
	}
	if (attestation.mode === "nitro-attested" && !attestation.attestation) {
		throw new Error(
			"nitro-attested response did not include attestation bytes",
		);
	}
	if (attestation.mode === "local-unattested" && attestation.attestation) {
		throw new Error(
			"local-unattested response unexpectedly included attestation",
		);
	}

	const enclavePublicKey = new Ed25519PublicKey(hexToBytes(health.publicKey));
	const passkeyProvider =
		await NodePasskeyProvider.create("aegis-local-cosign");
	const passkey = await PasskeyKeypair.getPasskeyInstance(
		passkeyProvider,
		"aegis-local-cosign",
	);
	const multisig = MultiSigPublicKey.fromPublicKeys({
		threshold: 2,
		publicKeys: [
			{ publicKey: passkey.getPublicKey(), weight: 1 },
			{ publicKey: enclavePublicKey, weight: 1 },
		],
	});

	const txBytes = new Uint8Array([1, 2, 3]);
	const { signature: userSig } = await passkey.signTransaction(txBytes);
	const response = await coSign({
		txBytes: Buffer.from(txBytes).toString("base64"),
		userSig,
		vaultAddress: multisig.toSuiAddress(),
		policyRequest: {
			txDigest: "demo",
			recipient: "0xfriend",
			package: "0x2",
			netOutflowMist: 1_000_000_000,
		},
	});

	if (!response.ok) {
		throw new Error(`co_sign refused unexpectedly: ${response.reason}`);
	}

	const combined = multisig.combinePartialSignatures([
		userSig,
		response.enclaveSig,
	]);
	if (!(await multisig.verifyTransaction(txBytes, combined))) {
		throw new Error("combined multisig signature did not verify");
	}

	const refused = await coSign({
		txBytes: Buffer.from(txBytes).toString("base64"),
		userSig,
		vaultAddress: multisig.toSuiAddress(),
		policyRequest: {
			txDigest: "drain",
			recipient: "0xattacker",
			package: "0x2",
			netOutflowMist: 1_000_000_000,
		},
	});

	if (refused.ok || refused.reason !== "recipient is not allowlisted") {
		throw new Error(
			`expected recipient refusal, got ${JSON.stringify(refused)}`,
		);
	}

	console.log(
		JSON.stringify(
			{
				vaultAddress: multisig.toSuiAddress(),
				enclavePublicKey: health.publicKey,
				attestationMode: attestation.mode,
				combinedSignatureVerified: true,
				refusalReason: refused.reason,
			},
			null,
			2,
		),
	);
} finally {
	server.kill("SIGTERM");
}

async function waitForHealth(): Promise<HealthResponse> {
	for (let attempt = 0; attempt < 80; attempt += 1) {
		try {
			const response = await fetch(`${ENCLAVE_URL}/health_check`);
			if (response.ok) {
				return (await response.json()) as HealthResponse;
			}
		} catch {
			await delay(100);
		}
	}

	throw new Error(`enclave server did not become healthy. stderr: ${stderr}`);
}

async function getAttestation(): Promise<AttestationResponse> {
	const response = await fetch(`${ENCLAVE_URL}/get_attestation`);
	if (!response.ok) {
		throw new Error(
			`get_attestation HTTP ${response.status}: ${await response.text()}`,
		);
	}

	return (await response.json()) as AttestationResponse;
}

async function coSign(body: unknown): Promise<CoSignResponse> {
	const response = await fetch(`${ENCLAVE_URL}/co_sign`, {
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

function hexToBytes(hex: string): Uint8Array {
	const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
	return Uint8Array.from(Buffer.from(normalized, "hex"));
}
