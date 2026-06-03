import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createTestnetGrpcClient, TESTNET_RPC_URL } from "@aegis/shared";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { fromBase64 } from "@mysten/sui/utils";
import { buildStakeTransaction } from "../app/src/lib/wallet-workflows";

const client = createTestnetGrpcClient();
const stakeMist = BigInt(process.env.AEGIS_STAKE_MIST ?? "1000000000");
const signer = loadActiveLocalKeypair();
const sender = signer.toSuiAddress();

await ensureFunded(sender, stakeMist + 50_000_000n);
const validatorAddress =
	process.env.AEGIS_TEST_VALIDATOR_ADDRESS ?? (await selectActiveValidator());

const tx = buildStakeTransaction({ validatorAddress, amountMist: stakeMist });
tx.setSender(sender);

const result = await signer.signAndExecuteTransaction({
	transaction: tx,
	client,
	include: { effects: true, transaction: true },
});
const txn = result.Transaction ?? result.FailedTransaction;

if (!txn.status.success) {
	throw new Error(`staking transaction failed: ${txn.status.error}`);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			sender,
			validatorAddress,
			stakeMist: stakeMist.toString(),
			digest: txn.digest,
			status: txn.status,
		},
		null,
		2,
	),
);

async function ensureFunded(address: string, requiredMist: bigint) {
	const starting = await getMistBalance(address);
	if (starting >= requiredMist) {
		return;
	}

	try {
		await requestSuiFromFaucetV2({
			host: getFaucetHost("testnet"),
			recipient: address,
		});
	} catch (error) {
		throw new Error(
			`testnet balance for ${address} is ${starting.toString()} MIST, below required ${requiredMist.toString()} MIST, and faucet funding failed: ${String(error)}`,
		);
	}

	for (let attempt = 0; attempt < 30; attempt += 1) {
		const next = await getMistBalance(address);
		if (next >= requiredMist) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}

	throw new Error(
		`testnet balance for ${address} stayed below required ${requiredMist.toString()} MIST`,
	);
}

async function getMistBalance(owner: string): Promise<bigint> {
	const { balance } = await client.core.getBalance({ owner });
	return BigInt(balance.balance);
}

async function selectActiveValidator(): Promise<string> {
	const response = await fetch(TESTNET_RPC_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "suix_getLatestSuiSystemState",
			params: [],
		}),
	});
	if (!response.ok) {
		throw new Error(`system state RPC failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as {
		result?: {
			activeValidators?: {
				suiAddress?: string;
				stakingPoolSuiBalance?: string;
			}[];
		};
		error?: { message?: string };
	};
	if (body.error) {
		throw new Error(`system state RPC failed: ${body.error.message}`);
	}

	const validator = body.result?.activeValidators
		?.filter((candidate) =>
			/^0x[0-9a-fA-F]{64}$/.test(candidate.suiAddress ?? ""),
		)
		.sort((left, right) =>
			Number(
				BigInt(right.stakingPoolSuiBalance ?? "0") -
					BigInt(left.stakingPoolSuiBalance ?? "0"),
			),
		)[0];

	if (!validator?.suiAddress) {
		throw new Error("testnet returned no active validators");
	}

	return validator.suiAddress;
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
