import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSuiBalance } from "@aegis/shared";

type GateReport = {
	gate: string;
	required: boolean;
	ready: boolean;
	detail: string;
	data?: Record<string, unknown>;
};

const requiredStakeMist = 1_050_000_000n;
const DEFAULT_ENCLAVE_CONFIG_ID =
	"0xb5f8cc7c85c21485ef75affcec55f093650e320c63e2d5d36000dc80bbd03281";
const DEFAULT_REGISTERED_ENCLAVE_ID =
	"0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e";
const activeAddress = readActiveSuiAddress();
const stakingBalance = activeAddress
	? await readMistBalance(activeAddress).catch((error: unknown) => ({
			error: String(error),
		}))
	: { error: "active Sui address was not found" };
const nitroAttestation = await readNitroAttestationGate();

const missingEnokiEnv = [
	"NEXT_PUBLIC_ENOKI_API_KEY",
	"NEXT_PUBLIC_GOOGLE_CLIENT_ID",
	"ENOKI_PRIVATE_API_KEY",
].filter((name) => !process.env[name]);

const gates: GateReport[] = [
	{
		gate: "nitro-attestation",
		required: true,
		ready: nitroAttestation.ready,
		detail: nitroAttestation.detail,
		data: nitroAttestation.data,
	},
	{
		gate: "enoki-zklogin-sponsored-gas",
		required: true,
		ready: missingEnokiEnv.length === 0,
		detail:
			missingEnokiEnv.length === 0
				? "Enoki and OAuth environment variables are present."
				: "Live zkLogin and sponsored transaction execution require these environment variables.",
		data: {
			missingEnv: missingEnokiEnv,
		},
	},
	{
		gate: "testnet-native-staking-execution",
		required: true,
		ready:
			"balanceMist" in stakingBalance &&
			BigInt(stakingBalance.balanceMist) >= requiredStakeMist,
		detail:
			"balanceMist" in stakingBalance
				? "Live staking requires at least 1 SUI plus gas in the active local testnet wallet."
				: "Could not read active local testnet staking balance.",
		data: {
			activeAddress,
			requiredMist: requiredStakeMist.toString(),
			...stakingBalance,
		},
	},
	{
		gate: "mainnet-deploy-and-swap-execution",
		required: true,
		ready: process.env.AEGIS_ALLOW_MAINNET_SPEND === "true",
		detail:
			"Mainnet deploy and live swap execution spend real SUI and require explicit approval.",
		data: {
			approvalEnv: "AEGIS_ALLOW_MAINNET_SPEND=true",
		},
	},
	{
		gate: "browser-and-native-device-proof",
		required: false,
		ready: process.env.AEGIS_ALLOW_BROWSER_AUTOMATION === "true",
		detail:
			process.env.AEGIS_ALLOW_BROWSER_AUTOMATION === "true"
				? "Browser automation is approved for this run; attach to a browser/device harness before claiming live UI proof."
				: "Optional proof is intentionally skipped for the current shell-only evidence set.",
		data: {
			acceptedEvidence: "shell-render/build checks plus live command output",
			approvalEnv: "AEGIS_ALLOW_BROWSER_AUTOMATION=true",
		},
	},
];

console.log(
	JSON.stringify(
		{
			status: gates.every((gate) => gate.ready || !gate.required)
				? "ready"
				: "blocked",
			gates,
		},
		null,
		2,
	),
);

function readActiveSuiAddress(): string | null {
	const configPath = join(homedir(), ".sui", "sui_config", "client.yaml");
	if (!existsSync(configPath)) {
		return null;
	}

	const config = readFileSync(configPath, "utf8");
	return (
		config.match(/active[-_]address:\s*"?([^"\n]+)"?/)?.[1]?.trim() ?? null
	);
}

async function readMistBalance(address: string) {
	const balance = await getSuiBalance(address);
	return {
		balanceMist: balance.totalBalance,
	};
}

async function readNitroAttestationGate(): Promise<
	Pick<GateReport, "ready" | "detail" | "data">
> {
	const pcrPath = process.env.AEGIS_PCRS_JSON ?? "enclave/out/pcr-values.json";
	const attestationPath =
		process.env.AEGIS_ATTESTATION_PATH ?? "enclave/attestation.json";
	const configId =
		process.env.AEGIS_ENCLAVE_CONFIG_ID ?? DEFAULT_ENCLAVE_CONFIG_ID;
	const registeredEnclaveId =
		process.env.AEGIS_REGISTERED_ENCLAVE_ID ?? DEFAULT_REGISTERED_ENCLAVE_ID;

	if (!existsSync(pcrPath) || !existsSync(attestationPath)) {
		return {
			ready: false,
			detail:
				"Nitro attestation artifacts are missing; run enclave/DEPLOY.md on the Nitro host and download the PCR + attestation JSON.",
			data: {
				pcrPath,
				attestationPath,
				configId,
				registeredEnclaveId,
			},
		};
	}

	try {
		const pcrs = JSON.parse(readFileSync(pcrPath, "utf8")) as {
			pcr0?: string;
			pcr1?: string;
			pcr2?: string;
		};
		const attestation = JSON.parse(readFileSync(attestationPath, "utf8")) as {
			mode?: string;
			publicKey?: string;
			attestation?: string | null;
		};
		const pcrValues = [pcrs.pcr0, pcrs.pcr1, pcrs.pcr2];
		const validPcrs = pcrValues.every(
			(value) =>
				typeof value === "string" &&
				/^[0-9a-fA-F]{96}$/.test(value) &&
				!/^0+$/.test(value),
		);
		const publicKey = attestation.publicKey?.toLowerCase();
		const registeredPublicKey =
			await readRegisteredEnclavePublicKey(registeredEnclaveId);
		const ready =
			validPcrs &&
			attestation.mode === "nitro-attested" &&
			typeof attestation.attestation === "string" &&
			attestation.attestation.length > 0 &&
			/^[0-9a-f]{64}$/.test(publicKey ?? "") &&
			registeredPublicKey === publicKey;

		return {
			ready,
			detail: ready
				? "Non-debug Nitro attestation artifacts are present and the registered testnet enclave public key matches."
				: "Nitro artifacts were found, but mode, PCRs, attestation bytes, or registered public key did not match.",
			data: {
				mode: attestation.mode,
				publicKey,
				registeredPublicKey,
				pcrPath,
				attestationPath,
				configId,
				registeredEnclaveId,
				pcr0: pcrs.pcr0,
				pcr1: pcrs.pcr1,
				pcr2: pcrs.pcr2,
			},
		};
	} catch (error) {
		return {
			ready: false,
			detail: "Could not verify Nitro attestation artifacts.",
			data: {
				error: String(error),
				pcrPath,
				attestationPath,
				configId,
				registeredEnclaveId,
			},
		};
	}
}

async function readRegisteredEnclavePublicKey(
	registeredEnclaveId: string,
): Promise<string | null> {
	const response = await fetch("https://fullnode.testnet.sui.io:443", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "sui_getObject",
			params: [registeredEnclaveId, { showContent: true }],
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

	const pk = body.result?.data?.content?.fields?.pk;
	return pk ? Buffer.from(pk).toString("hex") : null;
}
